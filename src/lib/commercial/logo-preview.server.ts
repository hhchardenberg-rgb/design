import sharp, { type Sharp } from "sharp";

// Voorbeeldafbeeldingen voor logo's en ander drukwerkmateriaal. Een browser toont geen EPS of AI, en SVG
// tonen we bewust niet rechtstreeks (kan scripts bevatten). Daarom maken we bij uploaden een PNG-voorbeeld;
// het origineel blijft ongewijzigd en downloadbaar.
//
// - PNG, JPG, WEBP: verkleind naar PNG.
// - SVG: gerasterd door librsvg (voert geen scripts uit en laadt geen externe bestanden).
// - PDF en AI (moderne AI-bestanden zijn PDF-compatibel): eerste pagina gerenderd met pdf.js.
// - EPS: het ingebouwde voorbeeld (TIFF in een binaire EPS, of een EPSI-bitmap). Een EPS zonder ingebouwd
//   voorbeeld kan zonder PostScript-interpreter niet getoond worden; dan kan iemand los een voorbeeld toevoegen.

/** Langste zijde van het voorbeeld in pixels. */
export const PREVIEW_MAX = 800;

export type PreviewKind = "image" | "svg" | "pdf" | "eps-tiff" | "eps-epsi";

/** Typen waarvoor we een voorbeeld proberen te maken. */
export const PREVIEW_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "svg", "pdf", "ai", "eps"]);

const startsWith = (data: Buffer, text: string) => data.subarray(0, text.length).toString("latin1") === text;
const DOS_EPS_MAGIC = 0xc5d0d3c6;

function fit(img: Sharp) {
  return img.resize({ width: PREVIEW_MAX, height: PREVIEW_MAX, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
}

async function fromSvg(data: Buffer): Promise<Buffer> {
  // Rasteren op een dichtheid waarbij de langste zijde ongeveer PREVIEW_MAX wordt, zodat het scherp blijft.
  const meta = await sharp(data).metadata();
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0) || PREVIEW_MAX;
  const density = Math.min(2400, Math.max(10, Math.round((72 * PREVIEW_MAX) / longest)));
  return fit(sharp(data, { density }));
}

async function fromPdf(data: Buffer): Promise<Buffer> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Zonder aparte worker-thread: pdf.js gebruikt dan de hier geladen worker-code in hetzelfde proces.
  const g = globalThis as { pdfjsWorker?: unknown };
  // @ts-expect-error -- het workerbestand heeft geen eigen typen
  g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  const task = pdfjs.getDocument({ data: new Uint8Array(data), verbosity: 0 });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(8, PREVIEW_MAX / Math.max(base.width, base.height, 1));
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D, viewport }).promise;
    return fit(sharp(canvas.toBuffer("image/png")));
  } finally {
    await task.destroy();
  }
}

/** Binaire EPS (DOS-kop): PostScript plus optioneel een TIFF- of WMF-voorbeeld. */
function dosEpsSections(data: Buffer): { ps: Buffer; tiff: Buffer | null } | null {
  if (data.length < 30 || data.readUInt32BE(0) !== DOS_EPS_MAGIC) return null;
  const section = (off: number, len: number) => (len > 0 && off + len <= data.length ? data.subarray(off, off + len) : null);
  return { ps: section(data.readUInt32LE(4), data.readUInt32LE(8)) ?? Buffer.alloc(0), tiff: section(data.readUInt32LE(20), data.readUInt32LE(24)) };
}

/**
 * EPSI-voorbeeld: "%%BeginPreview: breedte hoogte diepte regels", daarna hexadecimale regels die met % beginnen.
 * Rijen lopen van boven naar beneden; 0 is wit, de hoogste waarde zwart.
 */
export function decodeEpsi(ps: Buffer): { width: number; height: number; gray: Buffer } | null {
  const text = ps.toString("latin1");
  const m = /%%BeginPreview:\s*(\d+)\s+(\d+)\s+(\d+)\s+\d+\s*[\r\n]/.exec(text);
  if (!m) return null;
  const [width, height, depth] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!width || !height || ![1, 2, 4, 8].includes(depth) || width * height > 16_000_000) return null;
  const end = text.indexOf("%%EndPreview", m.index);
  if (end < 0) return null;
  const hex = text.slice(m.index + m[0].length, end).replace(/^%/gm, "").replace(/[^0-9a-fA-F]/g, "");
  const rowBytes = Math.ceil((width * depth) / 8);
  if (hex.length < rowBytes * height * 2) return null;
  const bytes = Buffer.from(hex.slice(0, rowBytes * height * 2), "hex");
  const max = (1 << depth) - 1;
  const gray = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bit = x * depth;
      const byte = bytes[y * rowBytes + (bit >> 3)];
      const v = (byte >> (8 - depth - (bit & 7))) & max;
      gray[y * width + x] = 255 - Math.round((v * 255) / max);
    }
  }
  return { width, height, gray };
}

async function fromEps(data: Buffer): Promise<{ png: Buffer; kind: PreviewKind } | null> {
  const dos = dosEpsSections(data);
  if (dos?.tiff) return { png: await fit(sharp(dos.tiff)), kind: "eps-tiff" };
  const epsi = decodeEpsi(dos ? dos.ps : data);
  if (epsi) return { png: await fit(sharp(epsi.gray, { raw: { width: epsi.width, height: epsi.height, channels: 1 } })), kind: "eps-epsi" };
  return null;
}

/**
 * Maakt een PNG-voorbeeld, of null als dat niet lukt (bv. een EPS zonder ingebouwd voorbeeld of een
 * beschadigd bestand). Gooit nooit: een upload mag niet mislukken alleen omdat er geen voorbeeld van te maken is.
 */
export async function makePreview(ext: string, data: Buffer): Promise<{ png: Buffer; kind: PreviewKind } | null> {
  try {
    switch (ext) {
      case "png":
      case "jpg":
      case "jpeg":
      case "webp":
        return { png: await fit(sharp(data, { failOn: "error" }).rotate()), kind: "image" };
      case "svg":
        return { png: await fromSvg(data), kind: "svg" };
      case "pdf":
      case "ai":
      case "eps":
        if (startsWith(data, "%PDF")) return { png: await fromPdf(data), kind: "pdf" };
        return await fromEps(data);
      default:
        return null;
    }
  } catch (e) {
    console.warn("[logo-preview] geen voorbeeld te maken:", ext, e instanceof Error ? e.message : e);
    return null;
  }
}
