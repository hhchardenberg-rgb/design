import { readPsd, initializeCanvas, type Layer, type Psd } from "ag-psd";
import { createCanvas } from "@napi-rs/canvas";
import { parseLayerName, slugify } from "./naming";

// ag-psd heeft voor sommige (JPEG-gecomprimeerde) laagdata intern een Canvas
// nodig, ook wanneer useImageData:true is ingesteld. We registreren hiervoor
// dezelfde native canvas-implementatie als de render-engine; createImageData
// wordt door ag-psd zelf afgeleid via canvas.getContext('2d').createImageData.
initializeCanvas(((width: number, height: number) => {
  const w = Math.max(1, Math.round(width) || 1);
  const h = Math.max(1, Math.round(height) || 1);
  try {
    return createCanvas(w, h);
  } catch (e) {
    console.error("[psd] createCanvas faalde", { width, height, w, h }, e);
    throw e;
  }
}) as unknown as (width: number, height: number) => HTMLCanvasElement);
import { textLayerFromPsd } from "./text";
import { averageColorHex, compositeRegions, pixelDataToPng, type RasterRegion } from "./rasterize";
import {
  TEMPLATE_SCHEMA_VERSION,
  templateFieldInputSchema,
  type Layer as NormLayer,
  type TemplateFieldInput,
  type TemplateSchemaJson,
} from "@/lib/validations/template";

function makeField(input: {
  key: string;
  label: string;
  type: TemplateFieldInput["type"];
  required?: boolean;
  defaultValue?: string;
  maxLength?: number;
  imageFit?: "contain" | "cover";
  sortOrder: number;
}): TemplateFieldInput {
  return templateFieldInputSchema.parse(input);
}

export interface PsdImportWarning {
  message: string;
}

export interface PsdImportResult {
  schema: TemplateSchemaJson;
  fields: TemplateFieldInput[];
  backgroundPng: Buffer;
  /** Per veld een voorbeeldrender van de oorspronkelijke laag (handig als placeholder in de builder). */
  previewByField: Record<string, Buffer>;
  warnings: PsdImportWarning[];
  width: number;
  height: number;
}

interface DynamicLayerInfo {
  layer: Layer;
  key: string;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  visibilityField?: string;
}

/**
 * Importeert een PSD-bestand en zet het om naar de genormaliseerde
 * template-representatie die de rest van de applicatie gebruikt.
 *
 * Strategie (zie ook MASTERPROMPT sectie 4-5):
 *  1. Alle lagen zonder herkende TEXT:/IMAGE:/COLOR:-prefix (dus ook
 *     STATIC:* en naamloze lagen) worden plat gerasterd tot één
 *     achtergrondafbeelding — exact zoals ze er in Photoshop uitzien.
 *  2. Lagen binnen een VISIBILITY:<NAAM>-groep worden als eigen
 *     overlay-laag gerasterd en gekoppeld aan een checkbox-veld, zodat ze
 *     aan/uit gezet kunnen worden (bv. thuis- versus uitversie).
 *  3. TEXT:/IMAGE:/COLOR:-lagen worden NIET meegerasterd; in plaats
 *     daarvan onthouden we positie + typografie/opmaak, zodat de
 *     preview- en exportengine ze zelf met actuele gebruikersinvoer tekent.
 */
export async function importPsd(buffer: Buffer): Promise<PsdImportResult> {
  const psd: Psd = readPsd(buffer, {
    skipCompositeImageData: true,
    skipLayerImageData: false,
    skipThumbnail: true,
    useImageData: true,
    logMissingFeatures: false,
    throwForMissingFeatures: false,
  });

  const width = psd.width;
  const height = psd.height;
  const warnings: PsdImportWarning[] = [];

  const backgroundRegions: RasterRegion[] = [];
  const dynamicText: DynamicLayerInfo[] = [];
  const dynamicImage: DynamicLayerInfo[] = [];
  const dynamicColor: DynamicLayerInfo[] = [];
  const visibilityGroups = new Map<string, { label: string; regions: RasterRegion[]; bbox: Bbox }>();
  const usedKeys = new Set<string>();

  await walk(psd.children ?? [], undefined);

  async function walk(layers: Layer[], visibilityField: string | undefined) {
    for (const layer of layers) {
      if (layer.hidden) continue;

      const parsed = parseLayerName(layer.name);
      const isGroup = Array.isArray(layer.children);

      if (isGroup && parsed.kind === "VISIBILITY") {
        const groupKey = uniqueKey(parsed.key, usedKeys);
        if (!visibilityGroups.has(groupKey)) {
          visibilityGroups.set(groupKey, { label: parsed.label, regions: [], bbox: emptyBbox() });
        }
        await walk(layer.children ?? [], groupKey);
        continue;
      }

      if (isGroup) {
        await walk(layer.children ?? [], visibilityField);
        continue;
      }

      const left = layer.left ?? 0;
      const top = layer.top ?? 0;
      let w = (layer.right ?? left) - left;
      let h = (layer.bottom ?? top) - top;

      const isDynamic = parsed.kind === "TEXT" || parsed.kind === "IMAGE" || parsed.kind === "COLOR";
      if ((w <= 0 || h <= 0) && isDynamic) {
        // Photoshop schrijft voor "point text" (geen alineakader) en
        // sommige vormlagen geen betrouwbare laagbounds weg. In plaats van
        // het veld stilzwijgend te laten verdwijnen, vallen we terug op een
        // ruim standaardkader zodat de admin het altijd nog kan bijstellen
        // in de template-builder.
        const fallbackWidth = parsed.kind === "TEXT" ? Math.min(width - left - 40, 600) : 300;
        const fallbackHeight = parsed.kind === "TEXT" ? 120 : 300;
        w = Math.max(80, fallbackWidth);
        h = Math.max(60, fallbackHeight);
        warnings.push({
          message: `Laag "${layer.name}" had geen bruikbaar kader in het PSD-bestand (waarschijnlijk "point text" zonder alineakader). Er is een standaardkader toegepast — controleer en corrigeer de positie/afmeting in de template-builder.`,
        });
      } else if (w <= 0 || h <= 0) {
        continue;
      }

      if (parsed.kind === "TEXT") {
        dynamicText.push({ layer, key: uniqueKey(parsed.key, usedKeys), label: parsed.label, left, top, width: w, height: h, visibilityField });
        continue;
      }
      if (parsed.kind === "IMAGE") {
        dynamicImage.push({ layer, key: uniqueKey(parsed.key, usedKeys), label: parsed.label, left, top, width: w, height: h, visibilityField });
        continue;
      }
      if (parsed.kind === "COLOR") {
        dynamicColor.push({ layer, key: uniqueKey(parsed.key, usedKeys), label: parsed.label, left, top, width: w, height: h, visibilityField });
        continue;
      }

      // STATIC:* of geen herkende conventie -> plat rasteren.
      if (!layer.imageData) continue;
      const png = await pixelDataToPng(layer.imageData, layer.opacity ?? 1);
      const region: RasterRegion = { left, top, width: w, height: h, png };

      if (visibilityField) {
        const group = visibilityGroups.get(visibilityField)!;
        group.regions.push(region);
        group.bbox = unionBbox(group.bbox, { left, top, right: left + w, bottom: top + h });
      } else {
        backgroundRegions.push(region);
      }
    }
  }

  const backgroundPng = await compositeRegions(width, height, backgroundRegions);

  const layers: NormLayer[] = [
    {
      id: "background",
      type: "background",
      x: 0,
      y: 0,
      width,
      height,
      src: "", // wordt door de aanroeper (upload-route) vervangen door de opgeslagen URL
    },
  ];

  const fields: TemplateFieldInput[] = [];
  const previewByField: Record<string, Buffer> = {};
  let sortOrder = 0;

  // Zichtbaarheidsgroepen -> checkbox-veld + eigen gerasterde overlay-laag
  for (const [key, group] of visibilityGroups) {
    if (group.regions.length === 0) continue;
    const bbox = group.bbox;
    const groupWidth = Math.max(1, bbox.right - bbox.left);
    const groupHeight = Math.max(1, bbox.bottom - bbox.top);
    const localRegions = group.regions.map((r) => ({ ...r, left: r.left - bbox.left, top: r.top - bbox.top }));
    const overlayPng = await compositeRegions(groupWidth, groupHeight, localRegions);
    layers.push({
      id: `visibility_${key}`,
      type: "static_image",
      x: bbox.left,
      y: bbox.top,
      width: groupWidth,
      height: groupHeight,
      src: "",
      visibilityField: key,
    });
    previewByField[`__visibility_${key}`] = overlayPng;
    fields.push(makeField({
      key,
      label: `Toon: ${group.label}`,
      type: "CHECKBOX",
      required: false,
      defaultValue: "true",
      sortOrder: sortOrder++,
    }));
  }

  for (const info of dynamicText) {
    const textData = info.layer.text;
    const { layer: textLayer, warnings: textWarnings } = textLayerFromPsd(
      {
        key: info.key,
        name: info.label,
        left: info.left,
        top: info.top,
        width: info.width,
        height: info.height,
        visibilityField: info.visibilityField,
      },
      info.layer
    );
    layers.push(textLayer);
    warnings.push(...textWarnings.map((message) => ({ message })));

    fields.push(makeField({
      key: info.key,
      label: info.label,
      type: guessFieldTypeForText(info.key),
      required: true,
      defaultValue: textData?.text?.trim() || undefined,
      maxLength: 60,
      sortOrder: sortOrder++,
    }));
  }

  for (const info of dynamicImage) {
    if (info.layer.imageData) {
      previewByField[info.key] = await pixelDataToPng(info.layer.imageData, info.layer.opacity ?? 1);
    }
    layers.push({
      id: info.key,
      type: "image",
      field: info.key,
      x: info.left,
      y: info.top,
      width: info.width,
      height: info.height,
      fit: "cover",
      shape: "rect",
      cornerRadius: 0,
      visibilityField: info.visibilityField,
    });
    fields.push(makeField({
      key: info.key,
      label: info.label,
      type: info.key.includes("logo") ? "LOGO" : "IMAGE",
      required: false,
      imageFit: "cover",
      sortOrder: sortOrder++,
    }));
  }

  for (const info of dynamicColor) {
    let defaultColor = "#FF6F00";
    if (info.layer.imageData) {
      const png = await pixelDataToPng(info.layer.imageData, 1);
      defaultColor = await averageColorHex(png);
    }
    layers.push({
      id: info.key,
      type: "color",
      field: info.key,
      x: info.left,
      y: info.top,
      width: info.width,
      height: info.height,
      shape: "rect",
      cornerRadius: 0,
      defaultColor,
      visibilityField: info.visibilityField,
    });
    fields.push(makeField({
      key: info.key,
      label: info.label,
      type: "BRAND_COLOR",
      required: false,
      defaultValue: defaultColor,
      sortOrder: sortOrder++,
    }));
  }

  if (dynamicText.length === 0 && dynamicImage.length === 0 && dynamicColor.length === 0) {
    warnings.push({
      message:
        "Er zijn geen lagen gevonden met de TEXT:/IMAGE:/COLOR:-naamgevingsconventie. Bekijk de documentatie voor designers en controleer de laagnamen in het PSD-bestand.",
    });
  }

  const schema: TemplateSchemaJson = {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    width,
    height,
    backgroundColor: "#ffffff",
    layers,
  };

  return { schema, fields, backgroundPng, previewByField, warnings, width, height };
}

// ---------------------------------------------------------------------------

interface Bbox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function emptyBbox(): Bbox {
  return { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
}

function unionBbox(a: Bbox, b: Bbox): Bbox {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

function uniqueKey(base: string, used: Set<string>): string {
  let key = base;
  let i = 2;
  while (used.has(key)) {
    key = `${base}_${i++}`;
  }
  used.add(key);
  return key;
}

function guessFieldTypeForText(key: string): TemplateFieldInput["type"] {
  const k = key.toLowerCase();
  if (k.includes("score")) return "SCORE";
  if (k.includes("date") || k.includes("datum")) return "DATE";
  if (k.includes("time") || k.includes("tijd")) return "TIME";
  return "SHORT_TEXT";
}

export { slugify };
