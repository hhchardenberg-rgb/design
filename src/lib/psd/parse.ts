import { readPsd, initializeCanvas, type Layer, type Psd } from "ag-psd";
import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { parseLayerName, slugify } from "./naming";
import { textLayerFromPsd } from "./text";
import {
  alphaBounds,
  bufferFromPixels,
  composeLayers,
  createBuffer,
  diffBuffers,
  hasEffects,
  hasUnsupportedEffects,
  stackNormal,
  toRgba8,
  type Canvas,
  type ComposeIssue,
} from "./compose";
import { averageColorHex, pixelDataToPng } from "./rasterize";
import {
  TEMPLATE_SCHEMA_VERSION,
  templateFieldInputSchema,
  type Layer as NormLayer,
  type TemplateFieldInput,
  type TemplateSchemaJson,
} from "@/lib/validations/template";

// ag-psd heeft voor sommige (JPEG-gecomprimeerde) laagdata intern een Canvas
// nodig, ook wanneer useImageData:true is ingesteld.
initializeCanvas(((width: number, height: number) =>
  createCanvas(Math.max(1, Math.round(width) || 1), Math.max(1, Math.round(height) || 1))) as unknown as (
  width: number,
  height: number
) => HTMLCanvasElement);

/** Grenzen waarboven een PSD geweigerd wordt (geheugen en verwerkingstijd). */
export const PSD_LIMITS = {
  maxSide: 8000,
  maxPixels: 40_000_000,
  maxLayers: 1500,
};

export class PsdImportError extends Error {}

export interface PsdImportWarning {
  message: string;
}

export type ReportLayerKind = "static" | "text" | "image" | "color" | "visibility" | "hidden" | "empty";

export interface ImportReport {
  version: 1;
  width: number;
  height: number;
  layers: { name: string; kind: ReportLayerKind; segment?: number; field?: string; notes: string[] }[];
  issues: { severity: "error" | "warning" | "info"; message: string }[];
  /** Photoshop heeft een samengestelde afbeelding meegeschreven (Compatibiliteit maximaliseren). */
  compositeAvailable: boolean;
  /** "photoshop": de achtergrond is de samenstelling uit Photoshop (gecontroleerd). */
  backgroundSource: "composed" | "photoshop";
  /** Eigen samenstelling van alle lagen tegenover die van Photoshop. */
  match: { changedRatio: number; meanDelta: number } | null;
  /** Gestapelde segmenten tegenover één doorlopende samenstelling (volgorde-/overvloeicontrole). */
  stackMatch: { changedRatio: number; meanDelta: number };
  referenceUrl?: string;
  diffUrl?: string;
}

export interface PsdImportResult {
  schema: TemplateSchemaJson;
  fields: TemplateFieldInput[];
  /**
   * Afbeeldingen die de aanroeper opslaat; lagen verwijzen ernaar met
   * `asset:<naam>` in src/placeholderSrc. Daarnaast "reference" en "diff".
   */
  images: Record<string, Buffer>;
  report: ImportReport;
  warnings: PsdImportWarning[];
  width: number;
  height: number;
}

export const ASSET_PREFIX = "asset:";

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

type Item =
  | { type: "static"; layer: Layer; segment: number }
  | { type: "dynamic"; layer: Layer; kind: "TEXT" | "IMAGE" | "COLOR"; key: string; label: string; visibilityField?: string; hidden: boolean; clippedTo: Layer | null; inGroupEffects: boolean }
  | { type: "visibility"; group: Layer; key: string; label: string; segment: number };

/**
 * Importeert een PSD naar het templatemodel.
 *
 *  1. Vaste lagen worden in Photoshop-volgorde samengevoegd tot segmenten.
 *     Een nieuw segment begint boven elke invulbare laag, zodat een foto
 *     tussen vaste decoratielagen ook in de template tussen die lagen ligt.
 *  2. TEXT:/IMAGE:/COLOR:-lagen worden velden; ook als ze in Photoshop
 *     verborgen zijn (zo kan de designer een "lege" samenstelling bewaren).
 *  3. VISIBILITY:-groepen worden een eigen laag met een aan/uit-veld.
 *  4. Controle: de eigen samenstelling wordt vergeleken met de
 *     samengestelde afbeelding uit Photoshop; die laatste wordt alleen als
 *     achtergrond gebruikt als aantoonbaar precies dezelfde lagen erin zitten.
 */
export async function importPsd(buffer: Buffer): Promise<PsdImportResult> {
  let psd: Psd;
  try {
    psd = readPsd(buffer, {
      skipCompositeImageData: false,
      skipLayerImageData: false,
      skipThumbnail: true,
      useImageData: true,
      logMissingFeatures: false,
      throwForMissingFeatures: false,
    });
  } catch (error) {
    throw new PsdImportError(`Dit bestand kon niet als PSD gelezen worden (${error instanceof Error ? error.message : "onbekende fout"}).`);
  }

  const { width, height } = psd;
  if (width > PSD_LIMITS.maxSide || height > PSD_LIMITS.maxSide || width * height > PSD_LIMITS.maxPixels) {
    throw new PsdImportError(`Het document is te groot (${width}×${height}); maximaal ${PSD_LIMITS.maxSide} pixels per zijde.`);
  }
  const layerCount = countLayers(psd.children ?? []);
  if (layerCount > PSD_LIMITS.maxLayers) {
    throw new PsdImportError(`Het document heeft ${layerCount} lagen; maximaal ${PSD_LIMITS.maxLayers}.`);
  }
  if (psd.colorMode !== undefined && psd.colorMode !== 3) {
    throw new PsdImportError("Alleen RGB-documenten worden ondersteund; zet de kleurmodus in Photoshop op RGB.");
  }

  const report: ImportReport = {
    version: 1,
    width,
    height,
    layers: [],
    issues: [],
    compositeAvailable: Boolean(psd.imageData),
    backgroundSource: "composed",
    match: null,
    stackMatch: { changedRatio: 0, meanDelta: 0 },
  };
  if ((psd.bitsPerChannel ?? 8) !== 8) {
    report.issues.push({ severity: "info", message: `Het document gebruikt ${psd.bitsPerChannel} bits per kanaal; de template wordt in 8 bits opgeslagen.` });
  }

  // --- 1. Indelen ----------------------------------------------------------
  const items: Item[] = [];
  const usedKeys = new Set<string>();
  const staticSegment = new Map<Layer, number>();
  let segment = 0;

  const walk = (layers: Layer[], ctx: { hidden: boolean; visibilityField?: string; groupEffects: boolean }) => {
    let base: Layer | null = null;
    for (const layer of layers) {
      const parsed = parseLayerName(layer.name);
      const hidden = ctx.hidden || Boolean(layer.hidden);
      const name = layer.name ?? "naamloos";
      const clippedTo = layer.clipping ? base : null;
      if (!layer.clipping) base = layer;

      if (layer.children) {
        if (parsed.kind === "VISIBILITY" && !hidden) {
          const key = uniqueKey(parsed.key, usedKeys);
          items.push({ type: "visibility", group: layer, key, label: parsed.label, segment: ++segment });
          markStatic(layer.children, segment, staticSegment);
          report.layers.push({ name, kind: "visibility", segment, field: key, notes: [] });
          // Invulbare lagen binnen de groep blijven velden met dit aan/uit-veld.
          walkDynamicOnly(layer.children, { hidden, visibilityField: key, groupEffects: true });
          segment++;
          continue;
        }
        const groupEffects =
          ctx.groupEffects || (layer.blendMode !== undefined && layer.blendMode !== "pass through" && layer.blendMode !== "normal") || (layer.opacity ?? 1) < 1 || Boolean(layer.mask && !layer.mask.disabled);
        walk(layer.children, { ...ctx, hidden, groupEffects });
        continue;
      }

      if (parsed.kind === "TEXT" || parsed.kind === "IMAGE" || parsed.kind === "COLOR") {
        const key = uniqueKey(parsed.key, usedKeys);
        items.push({ type: "dynamic", layer, kind: parsed.kind, key, label: parsed.label, visibilityField: ctx.visibilityField, hidden, clippedTo, inGroupEffects: ctx.groupEffects });
        report.layers.push({ name, kind: parsed.kind === "TEXT" ? "text" : parsed.kind === "IMAGE" ? "image" : "color", field: key, notes: hidden ? ["verborgen in Photoshop"] : [] });
        segment++;
        continue;
      }

      if (hidden) {
        report.layers.push({ name, kind: "hidden", notes: [] });
        continue;
      }
      if (!layer.imageData && !layer.adjustment) {
        report.layers.push({ name, kind: "empty", notes: [] });
        continue;
      }
      staticSegment.set(layer, segment);
      items.push({ type: "static", layer, segment });
      report.layers.push({ name, kind: "static", segment, notes: staticNotes(layer) });
    }
  };
  const walkDynamicOnly = (layers: Layer[], ctx: { hidden: boolean; visibilityField?: string; groupEffects: boolean }) => {
    let base: Layer | null = null;
    for (const layer of layers) {
      const parsed = parseLayerName(layer.name);
      const clippedTo = layer.clipping ? base : null;
      if (!layer.clipping) base = layer;
      if (layer.children) {
        walkDynamicOnly(layer.children, { ...ctx, hidden: ctx.hidden || Boolean(layer.hidden) });
        continue;
      }
      if (parsed.kind === "TEXT" || parsed.kind === "IMAGE" || parsed.kind === "COLOR") {
        const key = uniqueKey(parsed.key, usedKeys);
        items.push({ type: "dynamic", layer, kind: parsed.kind, key, label: parsed.label, visibilityField: ctx.visibilityField, hidden: ctx.hidden || Boolean(layer.hidden), clippedTo, inGroupEffects: ctx.groupEffects });
        report.layers.push({ name: layer.name ?? "naamloos", kind: parsed.kind === "TEXT" ? "text" : parsed.kind === "IMAGE" ? "image" : "color", field: key, notes: ["binnen aan/uit-groep"] });
      }
    }
  };
  walk(psd.children ?? [], { hidden: false, groupEffects: false });

  // --- 2. Vaste segmenten samenstellen -------------------------------------
  const composeIssues: ComposeIssue[] = [];
  const globalAngle = psd.imageResources?.globalAngle ?? 30;
  const segmentIds = [...new Set([...staticSegment.values()])].sort((a, b) => a - b);
  const segmentBuffers = new Map<number, Canvas>();
  for (const id of segmentIds) {
    const buf = createBuffer(width, height);
    composeLayers(buf, psd.children ?? [], {
      include: (l) => (l.children ? true : staticSegment.get(l) === id),
      issues: composeIssues,
      globalAngle,
    });
    segmentBuffers.set(id, buf);
  }
  for (const issue of dedupeIssues(composeIssues)) {
    report.issues.push({ severity: "warning", message: `Laag "${issue.layer}": ${issue.message}.` });
  }

  // --- 3. Controle tegen Photoshop -----------------------------------------
  // Alles wat zichtbaar is (ook invulbare lagen met hun voorbeeldinhoud),
  // in één doorlopende samenstelling.
  const full = createBuffer(width, height);
  composeLayers(full, psd.children ?? [], { globalAngle });
  // Zonder "Compatibiliteit maximaliseren" staat er een lege (egale)
  // afbeelding in het bestand; die telt niet als samenstelling.
  const rawComposite = psd.imageData ? bufferFromPixels(psd.imageData) : null;
  const photoshop = rawComposite && !(isUniform(rawComposite) && !isUniform(full)) ? rawComposite : null;
  report.compositeAvailable = Boolean(photoshop);
  if (photoshop) {
    const d = diffBuffers(full, photoshop);
    report.match = { changedRatio: d.changedRatio, meanDelta: d.meanDelta };
    if (d.changedRatio > 0.02) {
      report.issues.push({
        // Meer dan 15% afwijking: de template zou duidelijk anders ogen dan
        // het ontwerp; activeren wordt geblokkeerd tot het PSD is aangepast.
        severity: d.changedRatio > 0.15 ? "error" : "warning",
        message: `De samenstelling wijkt op ${(d.changedRatio * 100).toFixed(1)}% van de pixels af van Photoshop. Bekijk de vergelijking in de builder.`,
      });
    }
  } else {
    report.issues.push({
      severity: "info",
      message: "Het bestand bevat geen samengestelde afbeelding (zet in Photoshop 'Compatibiliteit maximaliseren' aan) en kan dus niet met Photoshop vergeleken worden.",
    });
  }

  // De samenstelling van Photoshop mag alleen de achtergrond worden als er
  // aantoonbaar niets anders in zit: alle zichtbare lagen zitten in het
  // onderste vaste segment (invulbare lagen verborgen, geen aan/uit-groepen).
  const visibleOutsideFirst = items.some(
    (it) =>
      (it.type === "dynamic" && !it.hidden) ||
      it.type === "visibility" ||
      (it.type === "static" && it.segment !== segmentIds[0])
  );
  const useComposite = Boolean(photoshop && !visibleOutsideFirst && segmentIds.length > 0);
  if (useComposite && photoshop) {
    segmentBuffers.set(segmentIds[0], photoshop);
    report.backgroundSource = "photoshop";
    report.issues.push({ severity: "info", message: "De achtergrond is de samenstelling uit Photoshop (inclusief laageffecten)." });
  }

  // --- 4. Lagen en velden opbouwen ----------------------------------------
  const images: Record<string, Buffer> = {};
  const layers: NormLayer[] = [];
  const fields: TemplateFieldInput[] = [];
  const warnings: PsdImportWarning[] = [];
  let sortOrder = 0;
  const stacked = createBuffer(width, height);

  const backgroundId = segmentIds[0] === 0 ? 0 : null;
  if (backgroundId !== null) {
    const buf = segmentBuffers.get(0)!;
    images.background = await encodePng(buf);
    stackNormal(stacked, buf);
  }
  layers.push({ id: "background", type: "background", x: 0, y: 0, width, height, src: backgroundId !== null ? `${ASSET_PREFIX}background` : "" });

  const emitStaticSegment = async (id: number, visibilityField?: string, label?: string) => {
    const buf = segmentBuffers.get(id);
    if (!buf) return;
    const box = alphaBounds(buf);
    if (!box) return;
    const name = visibilityField ? `overlay-${visibilityField}` : `segment-${id}`;
    images[name] = await encodePng(buf, box);
    stackNormal(stacked, buf);
    layers.push({
      id: visibilityField ? `visibility_${visibilityField}` : `static_${id}`,
      name: label ?? `Vaste lagen ${id}`,
      type: "static_image",
      x: box.left,
      y: box.top,
      width: box.width,
      height: box.height,
      src: `${ASSET_PREFIX}${name}`,
      ...(visibilityField ? { visibilityField } : {}),
    });
  };

  const emitted = new Set<number>([0]);
  for (const item of items) {
    if (item.type === "static") {
      if (!emitted.has(item.segment)) {
        emitted.add(item.segment);
        await emitStaticSegment(item.segment);
      }
      continue;
    }
    if (item.type === "visibility") {
      emitted.add(item.segment);
      await emitStaticSegment(item.segment, item.key, `Toon: ${item.label}`);
      fields.push(makeField({ key: item.key, label: `Toon: ${item.label}`, type: "CHECKBOX", required: false, defaultValue: "true", sortOrder: sortOrder++ }));
      continue;
    }

    const { layer, key, label } = item;
    const box = layerBox(layer, width, height);
    if (box.fallback === "canvas") {
      warnings.push({ message: `Laag "${layer.name}" is leeg; het veld beslaat daarom de hele afbeelding. Pas het kader zo nodig aan in de builder.` });
    } else if (box.fallback) {
      warnings.push({ message: `Laag "${layer.name}" had geen bruikbaar kader (puntentekst zonder alineakader). Er is een standaardkader gebruikt; controleer het in de builder.` });
    }
    if (item.inGroupEffects) {
      warnings.push({ message: `Laag "${layer.name}" zit in een groep met dekking, overvloeimodus of masker; dat wordt voor deze invulbare laag niet nagebootst.` });
    }
    if (item.kind === "TEXT") {
      const { layer: textLayer, warnings: textWarnings } = textLayerFromPsd(
        { key, name: label, ...box, visibilityField: item.visibilityField },
        layer
      );
      layers.push(textLayer);
      warnings.push(...textWarnings.map((message) => ({ message })));
      fields.push(makeField({
        key,
        label,
        type: guessFieldTypeForText(key),
        required: true,
        defaultValue: layer.text?.text?.trim() || undefined,
        maxLength: 60,
        sortOrder: sortOrder++,
      }));
    } else if (item.kind === "IMAGE") {
      // Verborgen in Photoshop: geen voorbeeldbeeld, een leeg veld blijft leeg.
      if (layer.imageData && !item.hidden) {
        images[`placeholder-${key}`] = await pixelDataToPng(layer.imageData, layer.opacity ?? 1);
      }
      let shape: "rect" | "circle" = "rect";
      if (item.clippedTo) {
        shape = looksLikeEllipse(item.clippedTo) ? "circle" : "rect";
        warnings.push({
          message: `Laag "${layer.name}" is uitgeknipt op "${item.clippedTo.name}"; de foto krijgt ${shape === "circle" ? "een rond" : "een rechthoekig"} kader. Controleer de vorm in de builder.`,
        });
      }
      if (layer.mask?.imageData && !layer.mask.disabled) {
        warnings.push({ message: `Laag "${layer.name}" heeft een laagmasker; dat wordt voor de foto niet nagebootst.` });
      }
      layers.push({
        id: key,
        name: label,
        type: "image",
        field: key,
        ...box.rect,
        fit: "cover",
        shape,
        cornerRadius: 0,
        ...(images[`placeholder-${key}`] ? { placeholderSrc: `${ASSET_PREFIX}placeholder-${key}` } : {}),
        visibilityField: item.visibilityField,
      });
      fields.push(makeField({ key, label, type: key.includes("logo") ? "LOGO" : "IMAGE", required: false, imageFit: "cover", sortOrder: sortOrder++ }));
    } else {
      let defaultColor = "#FF6F00";
      if (layer.imageData) defaultColor = await averageColorHex(await pixelDataToPng(layer.imageData, 1));
      layers.push({
        id: key,
        name: label,
        type: "color",
        field: key,
        ...box.rect,
        shape: looksLikeEllipse(layer) ? "circle" : "rect",
        cornerRadius: 0,
        defaultColor,
        visibilityField: item.visibilityField,
      });
      fields.push(makeField({ key, label, type: "BRAND_COLOR", required: false, defaultValue: defaultColor, sortOrder: sortOrder++ }));
    }
    // Voor de volgorde-controle: de voorbeeldinhoud van de invulbare laag.
    if (!item.hidden && layer.imageData) {
      const one = createBuffer(width, height);
      composeLayers(one, [{ ...layer, clipping: false, children: undefined }]);
      stackNormal(stacked, one);
    }
  }

  // Volgorde-controle: segmenten los gestapeld tegenover één samenstelling.
  // Een verschil betekent dat een overvloeimodus over een invulbare laag heen
  // werkt, wat in losse lagen niet exact kan.
  const stack = diffBuffers(stacked, useComposite && photoshop ? photoshop : full);
  report.stackMatch = { changedRatio: stack.changedRatio, meanDelta: stack.meanDelta };
  if (stack.changedRatio > 0.01) {
    report.issues.push({
      severity: "warning",
      message: `Losse lagen wijken op ${(stack.changedRatio * 100).toFixed(1)}% af van de doorlopende samenstelling (waarschijnlijk een overvloeimodus of effect boven een invulbare laag).`,
    });
  }

  const dynamicCount = items.filter((i) => i.type === "dynamic").length;
  if (dynamicCount === 0) {
    report.issues.push({
      severity: "warning",
      message: "Er zijn geen lagen gevonden met de TEXT:/IMAGE:/COLOR:-naamgevingsconventie. Bekijk de documentatie voor designers en controleer de laagnamen.",
    });
  }
  for (const w of warnings) report.issues.push({ severity: "warning", message: w.message });

  images.reference = await encodePng(photoshop ?? full);
  const referenceForDiff = photoshop ?? full;
  images.diff = await sharp(diffBuffers(full, referenceForDiff).image, { raw: { width, height, channels: 4 } }).png().toBuffer();

  const schema: TemplateSchemaJson = {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    width,
    height,
    backgroundColor: "#ffffff",
    layers,
  };

  return {
    schema,
    fields,
    images,
    report,
    warnings: report.issues.filter((i) => i.severity !== "info").map((i) => ({ message: i.message })),
    width,
    height,
  };
}

// ---------------------------------------------------------------------------

async function encodePng(buf: Canvas, box?: { left: number; top: number; width: number; height: number }) {
  const img = sharp(toRgba8(buf), { raw: { width: buf.width, height: buf.height, channels: 4 } });
  return (box ? img.extract(box) : img).png({ compressionLevel: 9 }).toBuffer();
}

function isUniform(buf: Canvas): boolean {
  const d = buf.data;
  for (let i = 4; i < d.length; i++) if (d[i] !== d[i % 4]) return false;
  return true;
}

function countLayers(layers: Layer[]): number {
  return layers.reduce((n, l) => n + 1 + (l.children ? countLayers(l.children) : 0), 0);
}

function markStatic(layers: Layer[], segment: number, map: Map<Layer, number>) {
  for (const l of layers) {
    if (l.children) markStatic(l.children, segment, map);
    else {
      const k = parseLayerName(l.name).kind;
      if (k !== "TEXT" && k !== "IMAGE" && k !== "COLOR" && l.imageData) map.set(l, segment);
    }
  }
}

function staticNotes(layer: Layer): string[] {
  const notes: string[] = [];
  if (layer.adjustment) notes.push("aanpassingslaag (niet toegepast)");
  if (hasUnsupportedEffects(layer)) notes.push("laageffecten");
  else if (hasEffects(layer)) notes.push("slagschaduw");
  if (layer.clipping) notes.push("uitknipmasker");
  if (layer.mask && !layer.mask.disabled) notes.push("laagmasker");
  if (layer.blendMode && layer.blendMode !== "normal") notes.push(`overvloeimodus ${layer.blendMode}`);
  if (layer.placedLayer) notes.push("slim object (gerasterd)");
  return notes;
}

function dedupeIssues(issues: ComposeIssue[]) {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.layer}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Kader van een invulbare laag. Een lege pixellaag (vaak een losse, lege
 * laag als plek voor een foto) heeft geen kader: dan het kader van zijn
 * masker, of anders de hele afbeelding.
 */
function layerBox(layer: Layer, docWidth: number, docHeight: number) {
  let left = layer.left ?? 0;
  let top = layer.top ?? 0;
  let w = (layer.right ?? left) - left;
  let h = (layer.bottom ?? top) - top;
  let fallback: false | "default" | "canvas" = false;
  if (w <= 0 || h <= 0) {
    const mask = layer.mask;
    const mw = (mask?.right ?? 0) - (mask?.left ?? 0);
    const mh = (mask?.bottom ?? 0) - (mask?.top ?? 0);
    if (layer.text) {
      w = Math.max(80, Math.min(docWidth - left - 40, 600));
      h = 120;
      fallback = "default";
    } else if (mask && !mask.disabled && mw > 0 && mh > 0) {
      left = mask.left ?? 0;
      top = mask.top ?? 0;
      w = mw;
      h = mh;
    } else {
      left = 0;
      top = 0;
      w = docWidth;
      h = docHeight;
      fallback = "canvas";
    }
  }
  return { left, top, width: w, height: h, fallback, rect: { x: left, y: top, width: w, height: h } };
}

/** Bedekt de laag ongeveer een ellips binnen zijn kader (rond fotokader)? */
function looksLikeEllipse(layer: Layer): boolean {
  const img = layer.imageData;
  if (!img || img.width < 8 || img.height < 8) return false;
  const a = (x: number, y: number) => img.data[(y * img.width + x) * 4 + 3] as number;
  const max = img.data instanceof Uint8Array || img.data instanceof Uint8ClampedArray ? 255 : img.data instanceof Uint16Array ? 65535 : 1;
  const corner = [a(0, 0), a(img.width - 1, 0), a(0, img.height - 1), a(img.width - 1, img.height - 1)].every((v) => v < max * 0.1);
  const center = a(Math.floor(img.width / 2), Math.floor(img.height / 2)) > max * 0.9;
  let covered = 0;
  for (let y = 0; y < img.height; y += 2) for (let x = 0; x < img.width; x += 2) if (a(x, y) > max / 2) covered++;
  const ratio = covered / (Math.ceil(img.height / 2) * Math.ceil(img.width / 2));
  return corner && center && Math.abs(ratio - Math.PI / 4) < 0.06;
}

function uniqueKey(base: string, used: Set<string>): string {
  let key = base;
  let i = 2;
  while (used.has(key)) key = `${base}_${i++}`;
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
