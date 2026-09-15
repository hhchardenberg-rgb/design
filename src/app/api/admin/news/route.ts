import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { processAndStoreImage } from "@/lib/uploadImage";

export async function GET() {
  try {
    await requireAdmin();
    const posts = await prisma.newsPost.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      include: { author: { select: { name: true } } },
    });
    return NextResponse.json({ posts });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const form = await req.formData();
    const title = String(form.get("title") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    const category = String(form.get("category") ?? "").trim();
    const pinned = form.get("pinned") === "true";
    const file = form.get("image");

    if (!title || !body) throw new ApiError(400, "Titel en tekst zijn verplicht.");

    const imageUrl = file instanceof File && file.size > 0 ? (await processAndStoreImage(file, { keyPrefix: "news" })).url : null;

    const post = await prisma.newsPost.create({
      data: {
        title,
        body,
        category: category || null,
        pinned,
        imageUrl,
        authorId: admin.id,
      },
      include: { author: { select: { name: true } } },
    });
    return NextResponse.json({ post });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
