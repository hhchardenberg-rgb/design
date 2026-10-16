import { createHash } from "node:crypto";
import { GlobalFonts } from "@napi-rs/canvas";
import { prisma } from "@/lib/prisma";
import { loadAssetBuffer } from "./loadAsset";

const registered = new Set<string>();
let builtinRegistered = false;

// Inter als systeembrede fallback zodat exports altijd leesbaar zijn, ook
// wanneer een template nog geen eigen lettertype heeft. Dit is nodig omdat
// Vercel's serverless functies — anders dan een gewone developmentmachine —
// geen systeemfonts hebben; zonder dit blijft ELKE tekstlaag die "Inter"
// (of een niet-geüpload font) gebruikt onzichtbaar in de export, terwijl de
// browserpreview wél gewoon "Inter" via Google Fonts toont.
const BUILTIN_INTER_WEIGHTS = [400, 500, 600, 700, 800] as const;

/** Registreert alle actieve, door admins geüploade fonts bij de canvas-engine. */
export async function ensureFontsRegistered() {
  if (!builtinRegistered) {
    builtinRegistered = true;
    await Promise.all(
      BUILTIN_INTER_WEIGHTS.map(async (weight) => {
        try {
          const buffer = await loadAssetBuffer(`/fonts/inter/inter-${weight}.woff2`);
          GlobalFonts.register(buffer, "Inter");
        } catch (error) {
          console.warn(`[fonts] kon ingebouwd fallback-font Inter ${weight} niet laden`, error);
        }
      })
    );
  }

  const fonts = await prisma.font.findMany({ where: { isActive: true } });
  await Promise.all(
    fonts.map(async (font) => {
      if (registered.has(font.id)) return;
      try {
        const buffer = await loadAssetBuffer(font.fileUrl);
        const key = GlobalFonts.register(buffer, font.family);
        if (key) registered.add(font.id);
      } catch (error) {
        console.warn(`[fonts] kon lettertype "${font.name}" niet laden`, error);
      }
    })
  );
}

/**
 * Vingerafdruk van de actieve lettertypen (id + bestand). Hoort in de
 * renderkey: wordt een font vervangen of uitgezet, dan levert dezelfde
 * ontwerprevisie een nieuwe export op in plaats van het oude bestand.
 */
export async function activeFontFingerprint(): Promise<string> {
  const fonts = await prisma.font.findMany({ where: { isActive: true }, select: { id: true, fileUrl: true } });
  const parts = fonts.map((f) => `${f.id}:${f.fileUrl}`).sort();
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}
