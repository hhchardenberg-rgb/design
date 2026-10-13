import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse, ApiError } from "@/lib/api-guards";
import { processAndStoreImage } from "@/lib/uploadImage";
import { isNewsSection } from "@/lib/news";
import { requireNewsRight } from "@/lib/news.server";

// Het onderdeel komt uit het bericht zelf, niet uit het verzoek: zo kan een beheerder van
// het ene onderdeel nooit een bericht van een ander onderdeel wijzigen of verwijderen.
async function sectionOf(id: string) {
  const post = await prisma.newsPost.findUnique({ where: { id }, select: { section: true } });
  if (!post || !isNewsSection(post.section)) throw new ApiError(404, "Bericht niet gevonden.");
  return post.section;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireNewsRight(await sectionOf(id), "canUpdate");
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
    const { id } = await params;
    await requireNewsRight(await sectionOf(id), "canDelete");
    await prisma.newsPost.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
