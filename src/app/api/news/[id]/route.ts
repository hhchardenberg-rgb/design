import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse, ApiError } from "@/lib/api-guards";
import { processAndStoreImage } from "@/lib/uploadImage";
import { isNewsSection, type NewsSection } from "@/lib/news";
import { requireNewsManager, sectionsFromForm } from "@/lib/news.server";

// Rechten komen uit de onderdelen van het bericht zelf: je wijzigt alleen berichten die bij
// een onderdeel staan dat je beheert, en je kunt alleen jouw onderdelen aan- of uitvinken.
// De onderdelen van anderen blijven ongemoeid.
async function loadPost(id: string) {
  const post = await prisma.newsPost.findUnique({ where: { id }, select: { sections: true } });
  if (!post) throw new ApiError(404, "Bericht niet gevonden.");
  return post.sections.filter(isNewsSection) as NewsSection[];
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { rights } = await requireNewsManager();
    const current = await loadPost(id);
    if (!current.some((s) => rights[s].canUpdate)) throw new ApiError(403, "Je mag dit bericht niet wijzigen.");
    const form = await req.formData();

    let sections: NewsSection[] | undefined;
    if (form.has("sections")) {
      const requested = sectionsFromForm(form);
      if (requested.some((s) => !rights[s].canUpdate)) throw new ApiError(403, "Je mag niet bij al deze onderdelen nieuws plaatsen.");
      const kept = current.filter((s) => !rights[s].canUpdate);
      sections = [...new Set([...kept, ...requested])];
      if (sections.length === 0) throw new ApiError(400, "Kies minstens één onderdeel.");
    }

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
      data: { title, body, category, pinned, imageUrl, sections },
      include: { author: { select: { name: true } } },
    });
    return NextResponse.json({ post });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/** Haalt het bericht weg bij jouw onderdelen; staat het daarna nergens meer, dan wordt het verwijderd. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { rights } = await requireNewsManager();
    const current = await loadPost(id);
    const removable = current.filter((s) => rights[s].canDelete);
    if (removable.length === 0) throw new ApiError(403, "Je mag dit bericht niet verwijderen.");
    const remaining = current.filter((s) => !rights[s].canDelete);
    if (remaining.length === 0) await prisma.newsPost.delete({ where: { id } });
    else await prisma.newsPost.update({ where: { id }, data: { sections: remaining } });
    return NextResponse.json({ ok: true, deleted: remaining.length === 0, remaining });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
