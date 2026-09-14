import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { getStorage, buildKey } from "@/lib/storage";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 4000;

/**
 * Generieke upload-endpoint voor foto's/logo's die gebruikers in de wizard
 * toevoegen (zie MASTERPROMPT sectie 11). Beeld wordt genormaliseerd naar
 * PNG en begrensd in afmeting zodat exports altijd voorspelbaar blijven.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "PHOTO").toUpperCase();

    if (!(file instanceof File)) throw new ApiError(400, "Geen bestand ontvangen.");
    if (!ALLOWED.has(file.type)) throw new ApiError(400, "Alleen PNG, JPG of WebP toegestaan.");
    if (file.size > MAX_BYTES) throw new ApiError(400, "Bestand is te groot (max 15MB).");

    const original = Buffer.from(await file.arrayBuffer());
    const image = sharp(original, { failOn: "none" }).rotate();
    const metadata = await image.metadata();

    const resized = image.resize({
      width: Math.min(metadata.width ?? MAX_DIMENSION, MAX_DIMENSION),
      height: Math.min(metadata.height ?? MAX_DIMENSION, MAX_DIMENSION),
      fit: "inside",
      withoutEnlargement: true,
    });

    const png = await resized.png().toBuffer();
    const finalMeta = await sharp(png).metadata();

    const storage = getStorage();
    const stored = await storage.put({
      key: buildKey("uploads", user.id, `${nanoid(10)}.png`),
      data: png,
      contentType: "image/png",
    });

    const asset = await prisma.uploadedAsset.create({
      data: {
        userId: user.id,
        kind: kind === "LOGO" ? "LOGO" : kind === "SPONSOR" ? "SPONSOR" : "PHOTO",
        url: stored.url,
        width: finalMeta.width,
        height: finalMeta.height,
        mimeType: "image/png",
      },
    });

    return NextResponse.json({ asset });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
