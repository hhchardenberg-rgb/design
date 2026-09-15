import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { processAndStoreImage } from "@/lib/uploadImage";

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

    const processed = await processAndStoreImage(file, { keyPrefix: "stock-photos" });

    const photo = await prisma.stockPhoto.create({
      data: {
        title,
        category,
        url: processed.url,
        width: processed.width,
        height: processed.height,
        mimeType: processed.mimeType,
      },
    });

    return NextResponse.json({ photo });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
