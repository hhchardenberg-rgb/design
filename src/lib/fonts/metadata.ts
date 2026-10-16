import { createHash } from "node:crypto";
import fontkit from "@pdf-lib/fontkit";

/**
 * Metadata uit het fontbestand zelf (niet uit de bestandsnaam): familie,
 * stijl, PostScript-naam, gewicht, cursief en de verticale metrics die het
 * tekstlayoutcontract gebruikt. Werkt voor TTF, OTF, WOFF en WOFF2.
 */
export interface FontFileMetadata {
  family: string;
  subfamily: string;
  postscriptName: string | null;
  fullName: string | null;
  weight: number;
  italic: boolean;
  unitsPerEm: number;
  /** Ascender in font units (positief). */
  ascender: number;
  /** Descender in font units (negatief of 0). */
  descender: number;
  capHeight: number | null;
  sha256: string;
  /** Unicode-codepoints die het font kan tekenen (voor de controle op benodigde tekens). */
  hasGlyph: (codePoint: number) => boolean;
}

interface FontkitFont {
  familyName?: string;
  subfamilyName?: string;
  postscriptName?: string;
  fullName?: string;
  italicAngle?: number;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  capHeight?: number;
  getName?: (key: string) => string | null;
  hasGlyphForCodePoint: (cp: number) => boolean;
  "OS/2"?: {
    usWeightClass?: number;
    typoAscender?: number;
    typoDescender?: number;
    fsSelection?: { italic?: boolean; oblique?: boolean; useTypoMetrics?: boolean; bold?: boolean };
  };
}

export class FontFileError extends Error {}

export function readFontMetadata(buffer: Buffer): FontFileMetadata {
  let font: FontkitFont;
  try {
    font = fontkit.create(buffer) as unknown as FontkitFont;
  } catch (error) {
    throw new FontFileError(`Dit bestand is geen leesbaar lettertype (${error instanceof Error ? error.message : "onbekende fout"}).`);
  }
  if ("fonts" in (font as object)) {
    throw new FontFileError("Fontcollecties (.ttc) worden niet ondersteund; upload de losse lettertypen.");
  }

  const os2 = font["OS/2"];
  const preferredFamily = safeName(font, "preferredFamily");
  const preferredSubfamily = safeName(font, "preferredSubfamily");
  const family = (preferredFamily ?? font.familyName ?? "").trim();
  const subfamily = (preferredSubfamily ?? font.subfamilyName ?? "Regular").trim();
  const italic = Boolean(os2?.fsSelection?.italic || os2?.fsSelection?.oblique || (font.italicAngle ?? 0) !== 0);
  const weight = clampWeight(os2?.usWeightClass ?? (os2?.fsSelection?.bold ? 700 : 400));

  // Zelfde keuze als browsers bij USE_TYPO_METRICS; anders de hhea-waarden.
  const useTypo = Boolean(os2?.fsSelection?.useTypoMetrics && os2.typoAscender);
  const ascender = useTypo ? os2!.typoAscender! : font.ascent;
  const descender = useTypo ? os2!.typoDescender ?? font.descent : font.descent;

  if (!family) throw new FontFileError("Het lettertype bevat geen familienaam.");
  if (!font.unitsPerEm || !Number.isFinite(ascender)) throw new FontFileError("Het lettertype bevat geen bruikbare metrics.");

  return {
    family,
    subfamily,
    postscriptName: font.postscriptName?.trim() || null,
    fullName: font.fullName?.trim() || null,
    weight,
    italic,
    unitsPerEm: font.unitsPerEm,
    ascender: Math.abs(ascender),
    descender: -Math.abs(descender),
    capHeight: font.capHeight && Number.isFinite(font.capHeight) ? font.capHeight : null,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    hasGlyph: (cp) => {
      try {
        return font.hasGlyphForCodePoint(cp);
      } catch {
        return false;
      }
    },
  };
}

function safeName(font: FontkitFont, key: string): string | null {
  try {
    const v = font.getName?.(key);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

function clampWeight(w: number): number {
  if (!Number.isFinite(w)) return 400;
  // Sommige oude fonts gebruiken 1-9 in plaats van 100-900.
  const value = w < 10 ? w * 100 : w;
  return Math.max(100, Math.min(900, Math.round(value / 100) * 100));
}

/** Tekens in `text` die het font niet kan tekenen (zonder spaties/regeleinden). */
export function missingGlyphs(meta: Pick<FontFileMetadata, "hasGlyph">, text: string): string[] {
  const missing = new Set<string>();
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (/\s/.test(ch)) continue;
    if (!meta.hasGlyph(cp)) missing.add(ch);
  }
  return [...missing];
}
