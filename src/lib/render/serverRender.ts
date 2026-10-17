import { applyLayerOverrides } from "@/lib/design/layer-overrides";
import { createCanvas, loadImage, type SKRSContext2D, type Image } from "@napi-rs/canvas";
import sharp from "sharp";
import type { Layer, TemplateSchemaJson, TextLayer } from "@/lib/validations/template";
import { resolveFontFace, type FontFaceInfo } from "@/lib/fonts/faces";
import { missingGlyphs } from "@/lib/fonts/metadata";
import { computeImageDraw, type ImageFieldValue } from "./imageFit";
import { loadAssetBuffer } from "./loadAsset";
import { ensureFaceRegistered, loadRenderFaces } from "./fonts";
import { drawTextLayout, type MeasureText, type TextCanvas } from "./textLayout";
import { layoutTextLayer, resolveLayerText, textPaint } from "./textLayer";

export type DesignFormData = Record<string, unknown>;
export type ExportFormat = "PNG" | "JPG" | "WEBP";

/**
 * Rendert een GeneratedDesign op volledige templateresolutie. Tekst gaat
 * via hetzelfde layoutcontract als de browserpreview (textLayout.ts) met
 * dezelfde fontbestanden; afbeeldingen via hetzelfde computeImageDraw.
 */
export class RenderError extends Error {}

export interface RenderOptions {
  /** Definitieve export: elke fout breekt af, er komt geen gedeeltelijk bestand. */
  strict?: boolean;
  textTransforms?: Record<string, string>;
  /** Voor tests; standaard alle faces uit de database plus Inter. */
  faces?: FontFaceInfo[];
}

const measureCanvas = createCanvas(16, 16);
const measureCtx = measureCanvas.getContext("2d");
const measureServer: MeasureText = (text, font) => {
  measureCtx.font = font;
  measureCtx.letterSpacing = "0px";
  return measureCtx.measureText(text).width;
};

export async function renderDesign(
  schema: TemplateSchemaJson,
  formData: DesignFormData,
  options: RenderOptions = {}
): Promise<import("@napi-rs/canvas").Canvas> {
  // Wat de invuller zelf aan lagen heeft aangepast (binnen wat de template toestaat).
  schema = applyLayerOverrides(schema, formData);
  const faces = options.faces ?? (await loadRenderFaces());

  const canvas = createCanvas(schema.width, schema.height);
  const ctx = canvas.getContext("2d");
  if (!schema.transparent) {
    ctx.fillStyle = schema.backgroundColor || "#ffffff";
    ctx.fillRect(0, 0, schema.width, schema.height);
  }

  const imageCache = new Map<string, Image>();
  async function getImage(url: string): Promise<Image> {
    const cached = imageCache.get(url);
    if (cached) return cached;
    const buf = await loadAssetBuffer(url);
    const img = await loadImage(buf);
    imageCache.set(url, img);
    return img;
  }

  for (const layer of schema.layers) {
    if (isHidden(layer, formData)) continue;
    const label = `"${layer.name ?? layer.id}"`;

    try {
      ctx.save();
      applyLayerTransform(ctx, layer);
      if (layer.type === "background" && layer.field) {
        await drawImageLayer(
          ctx,
          {
            id: layer.id,
            type: "image",
            field: layer.field,
            x: layer.x,
            y: layer.y,
            width: layer.width,
            height: layer.height,
            fit: layer.fit ?? "cover",
            shape: "rect",
            cornerRadius: 0,
            placeholderSrc: layer.src || undefined,
          },
          formData,
          getImage
        );
      } else if (layer.type === "background" || layer.type === "static_image") {
        if (layer.src) {
          const img = await getImage(layer.src);
          ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
        }
      } else if (layer.type === "text") {
        await drawTextLayer(ctx, layer, formData, faces, options, label, (schema.schemaVersion ?? 1) >= 2);
      } else if (layer.type === "image") {
        await drawImageLayer(ctx, layer, formData, getImage);
      } else if (layer.type === "color") {
        drawColorLayer(ctx, layer, formData);
      }
    } catch (error) {
      // Bij een definitieve export nooit een gedeeltelijk bestand opleveren:
      // een ontbrekende afbeelding of kapotte laag breekt de export af.
      if (error instanceof RenderError) throw error;
      if (options.strict) {
        throw new RenderError(`Onderdeel ${label} kon niet worden getekend.`, { cause: error });
      }
      console.warn(`[render] laag "${layer.id}" overgeslagen:`, error);
    } finally {
      ctx.restore();
    }
  }

  return canvas;
}

/**
 * Codeert naar het gevraagde formaat met een sRGB-profiel. JPG kent geen
 * transparantie: transparante delen krijgen de achtergrondkleur van de
 * template.
 */
export async function encodeCanvas(
  canvas: import("@napi-rs/canvas").Canvas,
  format: ExportFormat,
  schema?: Pick<TemplateSchemaJson, "backgroundColor">
): Promise<Buffer> {
  const png = canvas.toBuffer("image/png");
  const image = sharp(png).withIccProfile("srgb");
  if (format === "JPG") {
    return image.flatten({ background: schema?.backgroundColor || "#ffffff" }).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
  }
  if (format === "WEBP") return image.webp({ quality: 92, alphaQuality: 100 }).toBuffer();
  return image.png({ compressionLevel: 9 }).toBuffer();
}

function isHidden(layer: Layer, formData: DesignFormData): boolean {
  if (!layer.visibilityField) return false;
  const value = formData[layer.visibilityField];
  return value === false || value === "false";
}

/** Rotatie (graden, rond het midden van het kader) en dekking; gelijk aan de preview. */
function applyLayerTransform(ctx: SKRSContext2D, layer: Layer) {
  const opacity = layer.opacity ?? 1;
  if (opacity < 1) ctx.globalAlpha = Math.max(0, opacity);
  const rotation = layer.rotation ?? 0;
  if (rotation) {
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
}

async function drawTextLayer(
  ctx: SKRSContext2D,
  layer: TextLayer,
  formData: DesignFormData,
  faces: FontFaceInfo[],
  options: RenderOptions,
  label: string,
  pinnedFonts: boolean
) {
  const text = resolveLayerText(layer, formData, options.textTransforms?.[layer.field]);
  if (!text) return;

  const { face, status } = resolveFontFace(layer, faces);
  const meta = await ensureFaceRegistered(face);
  if (!meta) throw new RenderError(`Het lettertype voor ${label} kon niet worden geladen.`);
  // Oudere versies (zonder vastgelegde fonts) vielen altijd terug op Inter;
  // dat blijft zo, zodat bestaande templates niet ineens weigeren.
  if (options.strict && status === "missing" && pinnedFonts) {
    throw new RenderError(`Het lettertype voor ${label} ontbreekt.`);
  }
  const missing = missingGlyphs(meta, text);
  if (options.strict && missing.length > 0) {
    throw new RenderError(`Het lettertype van ${label} kan deze tekens niet tonen: ${missing.join(" ")}.`);
  }

  const layout = layoutTextLayer(layer, text, face, measureServer);
  if (options.strict && layout.overflow) {
    throw new RenderError(`De tekst in ${label} past niet. Maak de tekst korter.`);
  }
  ctx.translate(layer.x, layer.y);
  drawTextLayout(ctx as unknown as TextCanvas, layout, textPaint(layer));
}

async function drawImageLayer(
  ctx: SKRSContext2D,
  layer: Extract<Layer, { type: "image" }>,
  formData: DesignFormData,
  getImage: (url: string) => Promise<Image>
) {
  const value = (formData[layer.field] ?? {}) as ImageFieldValue;
  const src = value.assetUrl || layer.placeholderSrc;
  if (!src) return;

  const img = await getImage(src);
  const draw = computeImageDraw(
    { width: layer.width, height: layer.height },
    { width: img.width, height: img.height },
    layer.fit,
    value
  );

  clipLayerShape(ctx, layer);
  ctx.drawImage(img, layer.x + draw.drawX, layer.y + draw.drawY, draw.drawWidth, draw.drawHeight);
}

function drawColorLayer(ctx: SKRSContext2D, layer: Extract<Layer, { type: "color" }>, formData: DesignFormData) {
  const color = (formData[layer.field] as string | undefined) || layer.defaultColor;
  clipLayerShape(ctx, layer, false);
  ctx.fillStyle = color;
  ctx.fill();
}

function clipLayerShape(
  ctx: SKRSContext2D,
  layer: { x: number; y: number; width: number; height: number; shape: "rect" | "circle"; cornerRadius: number },
  applyClip = true
) {
  ctx.beginPath();
  if (layer.shape === "circle") {
    ctx.ellipse(layer.x + layer.width / 2, layer.y + layer.height / 2, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
  } else if (layer.cornerRadius > 0) {
    ctx.roundRect(layer.x, layer.y, layer.width, layer.height, layer.cornerRadius);
  } else {
    ctx.rect(layer.x, layer.y, layer.width, layer.height);
  }
  if (applyClip) ctx.clip();
}
