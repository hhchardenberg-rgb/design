import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse, ApiError } from "@/lib/api-guards";
import { processAndStoreImage } from "@/lib/uploadImage";
import { requireNewsManager, sectionsFromForm, sectionsWith } from "@/lib/news.server";

// De centrale nieuwsmodule. Een bericht kan bij meerdere onderdelen staan; een beheerder
// publiceert alleen bij de onderdelen waarvoor die rechten heeft.

/** De berichten in de onderdelen die deze gebruiker beheert, voor het beheerscherm. */
export async function GET() {
  try {
    const { rights } = await requireNewsManager();
    const managed = [
      ...new Set([...sectionsWith(rights, "canCreate"), ...sectionsWith(rights, "canUpdate"), ...sectionsWith(rights, "canDelete")]),
    ];
    const posts = await prisma.newsPost.findMany({
      where: { sections: { hasSome: managed } },
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
    const { user, rights } = await requireNewsManager();
    const form = await req.formData();
    const sections = sectionsFromForm(form);
    if (sections.length === 0) throw new ApiError(400, "Kies minstens één onderdeel.");
    if (sections.some((s) => !rights[s].canCreate)) throw new ApiError(403, "Je mag niet bij al deze onderdelen nieuws plaatsen.");

    const title = String(form.get("title") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    const category = String(form.get("category") ?? "").trim();
    const pinned = form.get("pinned") === "true";
    const file = form.get("image");

    if (!title || !body) throw new ApiError(400, "Titel en tekst zijn verplicht.");

    const imageUrl = file instanceof File && file.size > 0 ? (await processAndStoreImage(file, { keyPrefix: "news" })).url : null;

    const post = await prisma.newsPost.create({
      data: { title, body, category: category || null, pinned, imageUrl, sections, authorId: user.id },
      include: { author: { select: { name: true } } },
    });
    return NextResponse.json({ post });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
