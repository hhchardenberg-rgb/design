import { prisma } from "@/lib/prisma";

const FORMAT_KEYWORDS: Record<string, string> = {
  woff2: "woff2",
  woff: "woff",
  ttf: "truetype",
  otf: "opentype",
};

/**
 * Injecteert @font-face-regels voor alle actieve, door een admin
 * geüploade lettertypen (zie /admin/fonts) zodat ze niet alleen in de
 * server-side export (src/lib/render/fonts.ts) maar ook in de browser
 * — de live preview (Konva) én de rest van de UI — daadwerkelijk
 * worden geladen. De bestanden komen via /api/fonts/<id> (eigen domein),
 * omdat de Content-Security-Policy alleen fonts van 'self' toestaat. Zonder dit valt elke tekst in bv. "FF DIN" in de
 * browser stilzwijgend terug op een systeemfont, terwijl de export
 * wél het echte lettertype toont.
 */
export async function BrandFontFaces() {
  const fonts = await prisma.font.findMany({ where: { isActive: true } });
  if (fonts.length === 0) return null;

  const css = fonts
    .map((f) => {
      const family = f.family.replace(/["\\]/g, "");
      const format = FORMAT_KEYWORDS[f.format] ?? f.format;
      return `@font-face{font-family:"${family}";src:url("/api/fonts/${f.id}${f.sha256 ? `?v=${f.sha256}` : ""}") format("${format}");font-weight:${f.weight};font-style:${f.style};font-display:swap;}`;
    })
    .join("\n");

  return <style>{css}</style>;
}
