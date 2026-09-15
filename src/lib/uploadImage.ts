import sharp from "sharp";
import { nanoid } from "nanoid";
import { getStorage, buildKey } from "@/lib/storage";
import { ApiError } from "@/lib/api-guards";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface ProcessedImage {
  url: string;
  width?: number;
  height?: number;
  mimeType: string;
}

/**
 * Gedeelde upload-verwerking voor admin-geüploade afbeeldingen (fotobank,
 * nieuwsberichten, ...): normaliseert grootte/formaat via sharp en slaat het
 * resultaat op via de storage-abstractie. Foto's (JPEG) blijven JPEG voor
 * kleinere bestanden; andere formaten (bv. een PNG met logo/tekst) blijven
 * PNG voor scherpe randen.
 */
export async function processAndStoreImage(
  file: File,
  options: { keyPrefix: string; maxBytes?: number; maxDimension?: number }
): Promise<ProcessedImage> {
  const maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
  const maxDimension = options.maxDimension ?? 3000;

  if (!ALLOWED.has(file.type)) throw new ApiError(400, "Alleen PNG, JPG of WebP toegestaan.");
  if (file.size > maxBytes) throw new ApiError(400, `Bestand is te groot (max ${Math.round(maxBytes / (1024 * 1024))}MB).`);

  const original = Buffer.from(await file.arrayBuffer());
  const image = sharp(original, { failOn: "none" }).rotate();
  const metadata = await image.metadata();

  const resized = image.resize({
    width: Math.min(metadata.width ?? maxDimension, maxDimension),
    height: Math.min(metadata.height ?? maxDimension, maxDimension),
    fit: "inside",
    withoutEnlargement: true,
  });

  const isJpeg = file.type === "image/jpeg";
  const output = isJpeg ? await resized.jpeg({ quality: 88 }).toBuffer() : await resized.png().toBuffer();
  const finalMeta = await sharp(output).metadata();
  const ext = isJpeg ? "jpg" : "png";

  const storage = getStorage();
  const stored = await storage.put({
    key: buildKey(options.keyPrefix, `${nanoid(10)}.${ext}`),
    data: output,
    contentType: isJpeg ? "image/jpeg" : "image/png",
  });

  return { url: stored.url, width: finalMeta.width, height: finalMeta.height, mimeType: isJpeg ? "image/jpeg" : "image/png" };
}
