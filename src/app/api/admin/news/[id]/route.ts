import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";
import { processAndStoreImage } from "@/lib/uploadImage";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const form = await req.formData();

    const title = form.has("title") ? String(form.get("title")) : undefined;
    const body = form.has("body") ? String(form.get("body")) : undefined;
    const category = form.has("category") ? String(form.get("category")) || null : undefined;
    const pinned = form.has("pinned") ? form.get("pinned") === "true" : undefined;
    const removeImage = form.get("removeImage") === "true";
    const file = form.get("image");

    let imageUrl: string | null | undefined;
    if (file instanceof File && file.size > 0) {
      imageUrl = (await processAndStoreImage(file, { keyPrefix: "news" })).url;
    } else if (removeImage) {
      imageUrl = null;
    }

    const post = await prisma.newsPost.update({
      where: { id },
      data: { title, body, category, pinned, imageUrl },
      include: { author: { select: { name: true } } },
    });
    return NextResponse.json({ post });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    await prisma.newsPost.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
