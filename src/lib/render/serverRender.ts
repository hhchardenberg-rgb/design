import { createCanvas, loadImage, type SKRSContext2D, type Image } from "@napi-rs/canvas";
import type { Layer, TemplateSchemaJson } from "@/lib/validations/template";
import { fitText } from "./textFit";
import { measureServer, cssFont } from "./measureServer";
import { computeImageDraw, type ImageFieldValue } from "./imageFit";
import { loadAssetBuffer } from "./loadAsset";
import { ensureFontsRegistered } from "./fonts";

export type DesignFormData = Record<string, unknown>;
export type ExportFormat = "PNG" | "JPG" | "WEBP";

/**
 * Rendert een GeneratedDesign op volledige templateresolutie. Gebruikt
 * hetzelfde `fitText`/`computeImageDraw` als de browser-preview zodat het
 * eindresultaat nooit verrast t.o.v. wat de gebruiker zag (zie
 * MASTERPROMPT sectie 10).
 */
export async function renderDesign(
  schema: TemplateSchemaJson,
  formData: DesignFormData
): Promise<import("@napi-rs/canvas").Canvas> {
  await ensureFontsRegistered();

  const canvas = createCanvas(schema.width, schema.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = schema.backgroundColor || "#ffffff";
  ctx.fillRect(0, 0, schema.width, schema.height);

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

    try {
      if (layer.type === "background" || layer.type === "static_image") {
        if (!layer.src) continue;
        const img = await getImage(layer.src);
        ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
      } else if (layer.type === "text") {
        drawTextLayer(ctx, layer, formData);
      } else if (layer.type === "image") {
        await drawImageLayer(ctx, layer, formData, getImage);
      } else if (layer.type === "color") {
        drawColorLayer(ctx, layer, formData);
      }
    } catch (error) {
      console.warn(`[render] laag "${layer.id}" overgeslagen:`, error);
    }
  }

  return canvas;
}

export async function encodeCanvas(
  canvas: import("@napi-rs/canvas").Canvas,
  format: ExportFormat
): Promise<Buffer> {
  if (format === "JPG") return canvas.toBuffer("image/jpeg", 92);
  if (format === "WEBP") return canvas.toBuffer("image/webp", 92);
  return canvas.toBuffer("image/png");
}

function isHidden(layer: Layer, formData: DesignFormData): boolean {
  if (!layer.visibilityField) return false;
  const value = formData[layer.visibilityField];
  return value === false || value === "false";
}

function drawTextLayer(
  ctx: SKRSContext2D,
  layer: Extract<Layer, { type: "text" }>,
  formData: DesignFormData
) {
  const raw = (formData[layer.field] as string | undefined)?.trim() || layer.text?.trim() || "";
  if (!raw) return;

  const fit = fitText({
    text: raw,
    maxWidth: layer.width,
    maxHeight: layer.height,
    fontFamily: layer.fontFamily,
    fontWeight: layer.fontWeight,
    fontStyle: layer.fontStyle,
    startSize: layer.fontSize,
    minSize: layer.minFontSize,
    maxLines: layer.maxLines,
    lineHeight: layer.lineHeight,
    letterSpacing: layer.letterSpacing,
    uppercase: layer.uppercase,
    allowTruncate: layer.allowTruncate,
    measure: measureServer,
  });
  if (fit.lines.length === 0) return;

  ctx.save();
  ctx.font = cssFont({
    family: layer.fontFamily,
    size: fit.fontSize,
    weight: layer.fontWeight,
    style: layer.fontStyle,
    letterSpacing: layer.letterSpacing,
  });
  ctx.letterSpacing = `${layer.letterSpacing}px`;
  ctx.fillStyle = layer.color;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = layer.align;
  ctx.globalAlpha = layer.opacity ?? 1;

  const lineHeightPx = fit.fontSize * layer.lineHeight;
  const totalHeight = fit.lines.length * lineHeightPx;
  const startY = layer.y + Math.max(0, (layer.height - totalHeight) / 2) + fit.fontSize * 0.85;
  const anchorX =
    layer.align === "center"
      ? layer.x + layer.width / 2
      : layer.align === "right"
        ? layer.x + layer.width
        : layer.x;

  fit.lines.forEach((line, i) => {
    ctx.fillText(line, anchorX, startY + i * lineHeightPx);
  });
  ctx.restore();
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

  ctx.save();
  clipLayerShape(ctx, layer);
  ctx.drawImage(img, layer.x + draw.drawX, layer.y + draw.drawY, draw.drawWidth, draw.drawHeight);
  ctx.restore();
}

function drawColorLayer(
  ctx: SKRSContext2D,
  layer: Extract<Layer, { type: "color" }>,
  formData: DesignFormData
) {
  const color = (formData[layer.field] as string | undefined) || layer.defaultColor;
  ctx.save();
  clipLayerShape(ctx, layer, false);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function clipLayerShape(
  ctx: SKRSContext2D,
  layer: { x: number; y: number; width: number; height: number; shape: "rect" | "circle"; cornerRadius: number },
  applyClip = true
) {
  ctx.beginPath();
  if (layer.shape === "circle") {
    ctx.ellipse(
      layer.x + layer.width / 2,
      layer.y + layer.height / 2,
      layer.width / 2,
      layer.height / 2,
      0,
      0,
      Math.PI * 2
    );
  } else if (layer.cornerRadius > 0) {
    ctx.roundRect(layer.x, layer.y, layer.width, layer.height, layer.cornerRadius);
  } else {
    ctx.rect(layer.x, layer.y, layer.width, layer.height);
  }
  if (applyClip) ctx.clip();
}
