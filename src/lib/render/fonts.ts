import { GlobalFonts } from "@napi-rs/canvas";
import { prisma } from "@/lib/prisma";
import { loadAssetBuffer } from "./loadAsset";

const registered = new Set<string>();
let builtinRegistered = false;

/** Registreert alle actieve, door admins geüploade fonts bij de canvas-engine. */
export async function ensureFontsRegistered() {
  if (!builtinRegistered) {
    // Inter als systeembrede fallback zodat previews altijd leesbaar zijn,
    // ook wanneer een template nog geen eigen lettertype heeft.
    builtinRegistered = true;
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
