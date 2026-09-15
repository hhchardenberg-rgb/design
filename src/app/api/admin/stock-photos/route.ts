import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { getStorage, buildKey } from "@/lib/storage";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
// Ruim onder Vercel's 4.5MB hard limit voor request-bodies bij een gewone
// (niet-client-direct-naar-blob) upload, zie ook admin/templates/new.
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_DIMENSION = 3000;

export async function GET() {
  try {
    await requireAdmin();
    const photos = await prisma.stockPhoto.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }] });
    return NextResponse.json({ photos });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const form = await req.formData();
    const file = form.get("file");
    const title = String(form.get("title") ?? "").trim();
    const category = String(form.get("category") ?? "algemeen").trim() || "algemeen";

    if (!(file instanceof File)) throw new ApiError(400, "Geen bestand ontvangen.");
    if (!title) throw new ApiError(400, "Titel is verplicht.");
    if (!ALLOWED.has(file.type)) throw new ApiError(400, "Alleen PNG, JPG of WebP toegestaan.");
    if (file.size > MAX_BYTES) throw new ApiError(400, "Bestand is te groot (max 4MB).");

    const original = Buffer.from(await file.arrayBuffer());
    const image = sharp(original, { failOn: "none" }).rotate();
    const metadata = await image.metadata();

    const resized = image.resize({
      width: Math.min(metadata.width ?? MAX_DIMENSION, MAX_DIMENSION),
      height: Math.min(metadata.height ?? MAX_DIMENSION, MAX_DIMENSION),
      fit: "inside",
      withoutEnlargement: true,
    });

    // Foto's blijven JPEG (kleinere bestanden, prima voor foto's); andere
    // formaten (bv. een PNG met logo/tekst) blijven PNG voor scherpe randen.
    const isJpeg = file.type === "image/jpeg";
    const output = isJpeg ? await resized.jpeg({ quality: 88 }).toBuffer() : await resized.png().toBuffer();
    const finalMeta = await sharp(output).metadata();
    const ext = isJpeg ? "jpg" : "png";

    const storage = getStorage();
    const stored = await storage.put({
      key: buildKey("stock-photos", `${nanoid(10)}.${ext}`),
      data: output,
      contentType: isJpeg ? "image/jpeg" : "image/png",
    });

    const photo = await prisma.stockPhoto.create({
      data: {
        title,
        category,
        url: stored.url,
        width: finalMeta.width,
        height: finalMeta.height,
        mimeType: isJpeg ? "image/jpeg" : "image/png",
      },
    });

    return NextResponse.json({ photo });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
