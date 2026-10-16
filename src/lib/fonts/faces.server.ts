import type { Font } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadAssetBuffer } from "@/lib/render/loadAsset";
import { BUILTIN_FONT_FACES, fontAlias, type FontFaceInfo } from "./faces";
import { readFontMetadata, type FontFileMetadata } from "./metadata";

/** Metadata-kolommen voor Font, rechtstreeks uit het bestand. */
export function fontMetadataColumns(meta: FontFileMetadata) {
  return {
    fileFamily: meta.family,
    subfamily: meta.subfamily,
    postscriptName: meta.postscriptName,
    sha256: meta.sha256,
    unitsPerEm: meta.unitsPerEm,
    ascender: meta.ascender,
    descender: meta.descender,
    capHeight: meta.capHeight,
    weight: meta.weight,
    style: meta.italic ? "italic" : "normal",
    metadataReadAt: new Date(),
  };
}

export function fontFaceFromRecord(font: Font): FontFaceInfo {
  const upm = font.unitsPerEm ?? 0;
  const hasMetrics = upm > 0 && font.ascender != null && font.descender != null;
  return {
    id: font.id,
    alias: fontAlias(font.id),
    family: font.fileFamily || font.family,
    cssFamily: font.family,
    subfamily: font.subfamily || (font.style === "italic" ? "Italic" : String(font.weight)),
    postscriptName: font.postscriptName,
    weight: font.weight,
    style: font.style === "italic" ? "italic" : "normal",
    url: font.fileUrl,
    format: font.format,
    // Zonder ingelezen metrics een gangbare verhouding; wordt bij de eerste
    // keer laden alsnog uit het bestand gehaald (zie listFontFaces).
    ascent: hasMetrics ? font.ascender! / upm : 0.9,
    descent: hasMetrics ? Math.abs(font.descender!) / upm : 0.22,
    active: font.isActive,
    builtin: false,
  };
}

/**
 * Alle faces (ook uitgezette: een vastgelegde versie mag die blijven
 * gebruiken). Fonts zonder metadata worden eenmalig uit hun bestand gelezen.
 */
export async function listFontFaces(): Promise<FontFaceInfo[]> {
  const fonts = await prisma.font.findMany({ orderBy: [{ name: "asc" }, { weight: "asc" }] });
  const result: FontFaceInfo[] = [];
  for (const font of fonts) {
    let record = font;
    if (!font.metadataReadAt) {
      try {
        const meta = readFontMetadata(await loadAssetBuffer(font.fileUrl));
        record = await prisma.font.update({ where: { id: font.id }, data: fontMetadataColumns(meta) });
      } catch (error) {
        console.warn(`[fonts] metadata van "${font.name}" kon niet worden gelezen`, error);
      }
    }
    result.push(fontFaceFromRecord(record));
  }
  return [...BUILTIN_FONT_FACES, ...result];
}

/** Opnieuw inlezen van één font (na vervangen bestand of oude upload). */
export async function refreshFontMetadata(id: string) {
  const font = await prisma.font.findUniqueOrThrow({ where: { id } });
  const meta = readFontMetadata(await loadAssetBuffer(font.fileUrl));
  return prisma.font.update({ where: { id }, data: fontMetadataColumns(meta) });
}

/** Versies waarvan het schema dit font gebruikt (vastgelegd of via familienaam). */
export async function versionsUsingFont(font: Pick<Font, "id" | "family" | "fileFamily" | "postscriptName">) {
  const versions = await prisma.templateVersion.findMany({
    select: { id: true, versionNumber: true, schemaJson: true, template: { select: { name: true } } },
  });
  const names = new Set([font.family, font.fileFamily].filter(Boolean).map((n) => n!.toLowerCase()));
  return versions.filter((v) => {
    const layers = (v.schemaJson as { layers?: Array<Record<string, unknown>> })?.layers ?? [];
    return layers.some(
      (l) =>
        l.type === "text" &&
        (l.fontFaceId === font.id ||
          (font.postscriptName && l.fontPostscriptName === font.postscriptName) ||
          (typeof l.fontFamily === "string" && names.has(l.fontFamily.toLowerCase())))
    );
  });
}
