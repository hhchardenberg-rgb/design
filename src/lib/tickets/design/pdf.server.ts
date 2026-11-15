import fs from "fs/promises";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import { PDFDocument, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { layoutA4, A4_H, A4_W, type A4Box, type A4Layout, type FontKey, type Measurer } from "./a4-layout";
import { qrMatrix } from "./qr-matrix";
import type { AssetRef, TicketView } from "./view";

// A4-pdf van een ticket: echte vectortekst met ingebedde lettertypen (FF DIN en Inter), de
// QR-code als vectorvlakken met stille zone, en afbeeldingen in hoge resolutie.

const FONT_FILES: Record<FontKey, string> = {
  "din-medium": "fonts/ff-din/FF_DIN_Medium.ttf",
  "din-bold": "fonts/ff-din/FF_DIN_Bold.ttf",
  "din-black": "fonts/ff-din/FF_DIN_Black.ttf",
  "inter-400": "fonts/inter/inter-400.ttf",
  "inter-600": "fonts/inter/inter-600.ttf",
  "inter-700": "fonts/inter/inter-700.ttf",
  "inter-800": "fonts/inter/inter-800.ttf",
};

/** Geen contextuele varianten: Inter verschuift anders de dubbele punt in tijden (14:30). */
const FEATURES = { calt: false, liga: false, ccmp: true };

const fontBytes = new Map<FontKey, Promise<Buffer>>();
const readFont = (k: FontKey) => {
  if (!fontBytes.has(k)) fontBytes.set(k, fs.readFile(path.join(process.cwd(), "public", FONT_FILES[k])));
  return fontBytes.get(k)!;
};

interface FkFont {
  hasGlyphForCodePoint(cp: number): boolean;
  layout(text: string, features?: Record<string, boolean>): { advanceWidth: number };
  unitsPerEm: number;
}
const fkFonts = new Map<FontKey, Promise<FkFont>>();
const fkFont = (k: FontKey) => {
  if (!fkFonts.has(k)) fkFonts.set(k, readFont(k).then((b) => fontkit.create(b) as unknown as FkFont));
  return fkFonts.get(k)!;
};

/** Meet tekst met de echte lettertypebestanden (identiek aan wat in de pdf komt). */
export async function serverMeasurer(): Promise<Measurer> {
  const keys = Object.keys(FONT_FILES) as FontKey[];
  const fonts = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await fkFont(k)] as const))) as Record<FontKey, FkFont>;
  const cache = new Map<string, number>();
  return {
    clean(text, font) {
      const f = fonts[font];
      let out = "";
      for (const ch of text) {
        const cp = ch.codePointAt(0)!;
        if (cp === 10 || f.hasGlyphForCodePoint(cp)) {
          out += ch;
          continue;
        }
        const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
        out += [...base].every((c) => f.hasGlyphForCodePoint(c.codePointAt(0)!)) && base ? base : ch === "–" || ch === "—" ? "-" : "?";
      }
      return out;
    },
    width(text, font, size) {
      const key = `${font}|${text}`;
      let w = cache.get(key);
      if (w === undefined) {
        const f = fonts[font];
        w = f.layout(text, FEATURES).advanceWidth / f.unitsPerEm;
        cache.set(key, w);
      }
      return w * size;
    },
  };
}

export async function layoutForView(view: TicketView, generatedAt: string | null): Promise<A4Layout> {
  return layoutA4(view, await serverMeasurer(), { generatedAt });
}

export type AssetLoader = (a: AssetRef) => Promise<Buffer | null>;

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

/** Tekent één of meer berekende A4-indelingen in één pdf (elk ticket een eigen pagina). */
export async function renderPdf(layouts: A4Layout[], loadAsset: AssetLoader, meta: { title: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(meta.title);
  pdf.setCreator("HHC Hub");
  pdf.setProducer("HHC Hub");
  const fonts = new Map<FontKey, PDFFont>();
  const font = async (k: FontKey) => {
    if (!fonts.has(k)) fonts.set(k, await pdf.embedFont(await readFont(k), { subset: true, features: FEATURES }));
    return fonts.get(k)!;
  };
  const images = new Map<string, PDFImage | null>();
  const image = async (box: Extract<A4Box, { t: "image" }>) => {
    const key = `${box.asset.versionId ?? box.asset.url}|${box.crop ? Object.values(box.crop).join(",") : ""}|${box.opacity ?? 1}`;
    if (!images.has(key)) {
      let embedded: PDFImage | null = null;
      try {
        const raw = await loadAsset(box.asset);
        if (raw) {
          let img = sharp(raw, { failOn: "none" });
          if (box.crop) img = img.extract({ left: box.crop.sx, top: box.crop.sy, width: Math.max(1, box.crop.sw), height: Math.max(1, box.crop.sh) });
          // Maximaal ±300 dpi op de gebruikte afmeting: scherp, maar de pdf blijft klein.
          const targetW = Math.round((box.w / 72) * 300);
          img = img.resize({ width: targetW, withoutEnlargement: true });
          if (box.opacity !== undefined && box.opacity < 1) {
            img = img.ensureAlpha(box.opacity);
            embedded = await pdf.embedPng(await img.png().toBuffer());
          } else {
            const metaImg = await sharp(raw).metadata();
            embedded = metaImg.hasAlpha ? await pdf.embedPng(await img.png().toBuffer()) : await pdf.embedJpg(await img.jpeg({ quality: 88 }).toBuffer());
          }
        }
      } catch {
        embedded = null;
      }
      images.set(key, embedded);
    }
    return images.get(key)!;
  };

  for (const layout of layouts) {
    const page = pdf.addPage([A4_W, A4_H]);
    for (const box of layout.boxes) await paint(page, box);
  }
  return pdf.save();

  async function paint(page: PDFPage, b: A4Box) {
    const Y = (y: number) => A4_H - y;
    switch (b.t) {
      case "rect":
        if (b.radius) {
          page.drawSvgPath(roundedPath(b), { x: b.x, y: Y(b.y), color: b.fill ? hex(b.fill) : undefined, borderColor: b.stroke ? hex(b.stroke) : undefined, borderWidth: b.stroke ? (b.strokeWidth ?? 1) : 0, opacity: b.opacity, borderOpacity: b.opacity });
          return;
        }
        page.drawRectangle({ x: b.x, y: Y(b.y + b.h), width: b.w, height: b.h, color: b.fill ? hex(b.fill) : undefined, borderColor: b.stroke ? hex(b.stroke) : undefined, borderWidth: b.stroke ? (b.strokeWidth ?? 1) : 0, opacity: b.opacity });
        return;
      case "text":
        page.drawText(b.text, { x: b.x, y: Y(b.y), size: b.size, font: await font(b.font), color: hex(b.color), rotate: b.rotate ? degrees(b.rotate) : undefined, opacity: b.opacity });
        return;
      case "line":
        page.drawLine({ start: { x: b.x1, y: Y(b.y1) }, end: { x: b.x2, y: Y(b.y2) }, thickness: b.width, color: hex(b.color), dashArray: b.dash });
        return;
      case "image": {
        const img = await image(b);
        if (img) page.drawImage(img, { x: b.x, y: Y(b.y + b.h), width: b.w, height: b.h });
        return;
      }
      case "qr": {
        const q = qrMatrix(b.code);
        const unit = b.size / q.size;
        for (const [x, y, w] of q.runs) page.drawRectangle({ x: b.x + x * unit, y: Y(b.y + (y + 1) * unit), width: w * unit + 0.02, height: unit + 0.02, color: rgb(0, 0, 0) });
        return;
      }
    }
  }
}

/** Afgeronde rechthoek als svg-pad (pdf-lib tekent svg-paden met y omlaag vanaf het startpunt). */
function roundedPath(b: Extract<A4Box, { t: "rect" }>): string {
  const r = Math.min(b.radius ?? 0, b.w / 2, b.h / 2);
  return `M ${r} 0 H ${b.w - r} Q ${b.w} 0 ${b.w} ${r} V ${b.h - r} Q ${b.w} ${b.h} ${b.w - r} ${b.h} H ${r} Q 0 ${b.h} 0 ${b.h - r} V ${r} Q 0 0 ${r} 0 Z`;
}
