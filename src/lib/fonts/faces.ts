/**
 * Lettertypen als concrete "faces": één fontbestand met één gewicht en één
 * stijl. Een tekstlaag wordt gebonden aan precies één face; browser en
 * server registreren elk bestand onder dezelfde unieke alias en tekenen met
 * de metrics uit het bestand zelf. Dit bestand is client-veilig (geen
 * database, geen Node-API's).
 */

import type { TextLayer } from "@/lib/validations/template";
import type { LayoutFace } from "@/lib/render/textLayout";

export interface FontFaceInfo {
  id: string;
  /** Unieke familienaam waaronder dit bestand geregistreerd wordt. */
  alias: string;
  /** Familie zoals een designer hem kent (uit het bestand, anders de ingevoerde naam). */
  family: string;
  /** Familienaam zoals de admin hem bij uploaden invoerde (oude templates verwijzen hiernaar). */
  cssFamily: string;
  subfamily: string;
  postscriptName: string | null;
  weight: number;
  style: "normal" | "italic";
  /** Adres voor de browser (eigen domein). */
  url: string;
  /** Bronbestand voor de server; gelijk aan url bij meegeleverde fonts. */
  fileUrl: string;
  format: string;
  /** Ascender en descender als fractie van de em (positief). */
  ascent: number;
  descent: number;
  active: boolean;
  builtin: boolean;
}

export type FontResolutionStatus = "exact" | "matched" | "substitute" | "missing";

export interface FontResolution {
  face: FontFaceInfo;
  status: FontResolutionStatus;
  /** Uitleg voor de builder, alleen bij substitute/missing. */
  message: string | null;
}

// Inter wordt met de app meegeleverd (public/fonts/inter) en is de
// terugvaloptie. Metrics gemeten met src/lib/fonts/metadata.ts:
// unitsPerEm 2048, ascender 1984, descender -494 (alle gewichten gelijk).
const INTER_ASCENT = 1984 / 2048;
const INTER_DESCENT = 494 / 2048;
const INTER_WEIGHTS = [400, 500, 600, 700, 800] as const;
const INTER_NAMES: Record<number, string> = { 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold" };

export const BUILTIN_FONT_FACES: FontFaceInfo[] = INTER_WEIGHTS.map((weight) => ({
  id: `builtin-inter-${weight}`,
  alias: `hhcf-builtin-inter-${weight}`,
  family: "Inter",
  cssFamily: "Inter",
  subfamily: INTER_NAMES[weight],
  postscriptName: `Inter-${INTER_NAMES[weight]}`,
  weight,
  style: "normal",
  url: `/fonts/inter/inter-${weight}.woff2`,
  fileUrl: `/fonts/inter/inter-${weight}.woff2`,
  format: "woff2",
  ascent: INTER_ASCENT,
  descent: INTER_DESCENT,
  active: true,
  builtin: true,
}));

export function fontAlias(fontId: string): string {
  return `hhcf-${fontId}`;
}

export function layoutFace(face: FontFaceInfo): LayoutFace {
  return { alias: face.alias, weight: face.weight, style: face.style, ascent: face.ascent, descent: face.descent };
}

type TextFontRef = Pick<TextLayer, "fontFamily" | "fontWeight" | "fontStyle"> & {
  fontFaceId?: string;
  fontPostscriptName?: string;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, "");

/**
 * Bepaalt welke face een tekstlaag gebruikt:
 *  1. vastgelegde `fontFaceId` (ook als dat font inmiddels uit staat);
 *  2. PostScript-naam uit de PSD;
 *  3. familie + gewicht + stijl;
 *  4. zelfde familie, dichtstbijzijnde gewicht (substitute);
 *  5. Inter (missing).
 */
export function resolveFontFace(layer: TextFontRef, faces: FontFaceInfo[]): FontResolution {
  const all = [...faces, ...BUILTIN_FONT_FACES.filter((b) => !faces.some((f) => f.id === b.id))];

  if (layer.fontFaceId) {
    const pinned = all.find((f) => f.id === layer.fontFaceId);
    if (pinned) return { face: pinned, status: "exact", message: null };
  }

  const active = all.filter((f) => f.active);

  if (layer.fontPostscriptName) {
    const ps = norm(layer.fontPostscriptName);
    const byPs = active.find((f) => f.postscriptName && norm(f.postscriptName) === ps);
    if (byPs) return { face: byPs, status: "exact", message: null };
  }

  const wanted = norm(layer.fontFamily || "Inter");
  const style = layer.fontStyle ?? "normal";
  const weight = layer.fontWeight ?? 400;
  const family = active.filter((f) => norm(f.family) === wanted || norm(f.cssFamily) === wanted);

  const same = family.find((f) => f.weight === weight && f.style === style);
  if (same) return { face: same, status: "matched", message: null };

  if (family.length > 0) {
    const best = nearest(family, weight, style);
    return {
      face: best,
      status: "substitute",
      message: `${layer.fontFamily} ${weight}${style === "italic" ? " cursief" : ""} is er niet; ${best.family} ${best.subfamily} wordt gebruikt.`,
    };
  }

  const fallback = nearest(BUILTIN_FONT_FACES, weight, "normal");
  const label = layer.fontPostscriptName || layer.fontFamily || "onbekend";
  return {
    face: fallback,
    status: wanted === "inter" ? "substitute" : "missing",
    message: `Lettertype "${label}" is niet geüpload; Inter wordt gebruikt.`,
  };
}

function nearest(faces: FontFaceInfo[], weight: number, style: string): FontFaceInfo {
  return [...faces].sort((a, b) => {
    const sa = a.style === style ? 0 : 1;
    const sb = b.style === style ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return Math.abs(a.weight - weight) - Math.abs(b.weight - weight) || b.weight - a.weight;
  })[0];
}

export function faceLabel(face: FontFaceInfo): string {
  return `${face.family} ${face.subfamily}`.trim();
}
