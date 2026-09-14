import sharp from "sharp";
import type { PixelData } from "ag-psd";

export interface RasterRegion {
  left: number;
  top: number;
  width: number;
  height: number;
  png: Buffer;
}

/** Zet ag-psd PixelData (RGBA, 0-255) om naar een PNG-buffer, met optionele opacity. */
export async function pixelDataToPng(
  pixels: PixelData,
  opacity = 1
): Promise<Buffer> {
  const { width, height } = pixels;
  let data = Uint8ClampedArray.from(pixels.data as unknown as ArrayLike<number>);

  if (opacity < 1) {
    // Kopie met vermenigvuldigd alpha-kanaal zodat laagtransparantie behouden blijft.
    const scaled = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      scaled[i] = data[i];
      scaled[i + 1] = data[i + 1];
      scaled[i + 2] = data[i + 2];
      scaled[i + 3] = Math.round(data[i + 3] * opacity);
    }
    data = scaled;
  }

  return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
}

/**
 * Componeert een lijst regio's (bottom-to-top, zoals Photoshop-lagen) op een
 * transparante canvas van `width` x `height`. Regio's die (deels) buiten de
 * canvas vallen worden geclipt.
 */
export async function compositeRegions(
  width: number,
  height: number,
  regions: RasterRegion[]
): Promise<Buffer> {
  const base = sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  });

  if (regions.length === 0) {
    return base.png().toBuffer();
  }

  const composites = regions
    .map((region) => clampRegion(region, width, height))
    .filter((r): r is { left: number; top: number; input: Buffer } => r !== null);

  if (composites.length === 0) {
    return base.png().toBuffer();
  }

  return base
    .composite(composites.map((c) => ({ input: c.input, left: c.left, top: c.top })))
    .png()
    .toBuffer();
}

function clampRegion(
  region: RasterRegion,
  canvasWidth: number,
  canvasHeight: number
): { left: number; top: number; input: Buffer } | null {
  if (region.width <= 0 || region.height <= 0) return null;
  if (region.left >= canvasWidth || region.top >= canvasHeight) return null;
  if (region.left + region.width <= 0 || region.top + region.height <= 0) return null;
  // sharp ondersteunt geen negatieve composite-offsets; volledig binnen canvas
  // laten vallen is voor clubgrafische templates in de praktijk altijd het geval.
  if (region.left < 0 || region.top < 0) {
    return { left: Math.max(0, region.left), top: Math.max(0, region.top), input: region.png };
  }
  return { left: region.left, top: region.top, input: region.png };
}

/** Berekent de gemiddelde kleur van een PNG-buffer, als hex-string. */
export async function averageColorHex(png: Buffer): Promise<string> {
  const { data, info } = await sharp(png)
    .resize(8, 8, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const alpha = info.channels === 4 ? data[i + 3] : 255;
    if (alpha < 10) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }
  if (count === 0) return "#EA6A12";
  return rgbToHex(Math.round(r / count), Math.round(g / count), Math.round(b / count));
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
