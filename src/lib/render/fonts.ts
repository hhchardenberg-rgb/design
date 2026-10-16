import { createHash } from "node:crypto";
import { GlobalFonts } from "@napi-rs/canvas";
import { prisma } from "@/lib/prisma";
import type { FontFaceInfo } from "@/lib/fonts/faces";
import { listFontFaces } from "@/lib/fonts/faces.server";
import { readFontMetadata, type FontFileMetadata } from "@/lib/fonts/metadata";
import { loadAssetBuffer } from "./loadAsset";

/**
 * Registreert fontbestanden bij de canvas-engine onder hun unieke alias
 * (zie src/lib/fonts/faces.ts), zodat de export precies het bestand
 * gebruikt waaraan een tekstlaag gebonden is. Vercel-functies hebben geen
 * systeemfonts; Inter wordt daarom altijd uit public/fonts geladen.
 *
 * Begrensd: per serverproces wordt elk bestand één keer geladen, en de
 * metadata (tekenset) blijft bewaard voor de controle op ontbrekende tekens.
 */
const registered = new Map<string, Promise<FontFileMetadata | null>>();

export function ensureFaceRegistered(face: FontFaceInfo): Promise<FontFileMetadata | null> {
  const key = `${face.id}|${face.url}`;
  let pending = registered.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const buffer = await loadAssetBuffer(face.url);
        const meta = readFontMetadata(buffer);
        GlobalFonts.register(buffer, face.alias);
        return meta;
      } catch (error) {
        console.warn(`[fonts] kon lettertype "${face.family} ${face.subfamily}" niet laden`, error);
        registered.delete(key);
        return null;
      }
    })();
    registered.set(key, pending);
  }
  return pending;
}

export async function loadRenderFaces(): Promise<FontFaceInfo[]> {
  return listFontFaces();
}

/**
 * Vingerafdruk van alle lettertypen (id + bestand + aan/uit). Hoort in de
 * renderkey: wordt een font vervangen of uitgezet, dan levert dezelfde
 * ontwerprevisie een nieuwe export op in plaats van het oude bestand.
 */
export async function activeFontFingerprint(): Promise<string> {
  const fonts = await prisma.font.findMany({ select: { id: true, fileUrl: true, isActive: true, sha256: true } });
  const parts = fonts.map((f) => `${f.id}:${f.fileUrl}:${f.isActive ? 1 : 0}:${f.sha256 ?? ""}`).sort();
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}
