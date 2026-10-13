import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse, ApiError } from "@/lib/api-guards";
import { processAndStoreImage } from "@/lib/uploadImage";
import { isNewsSection } from "@/lib/news";
import { requireNewsRight } from "@/lib/news.server";

// Nieuwsberichten van één onderdeel (?section=hub|ticketing|commercial). Lezen kan
// iedereen met toegang tot dat onderdeel; plaatsen volgt de rechten van het onderdeel.

function sectionFrom(value: unknown) {
  if (!isNewsSection(value)) throw new ApiError(400, "Onbekend onderdeel.");
  return value;
}

export async function GET(req: Request) {
  try {
    const section = sectionFrom(new URL(req.url).searchParams.get("section"));
    await requireNewsRight(section, "canRead");
    const posts = await prisma.newsPost.findMany({
      where: { section },
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
    const form = await req.formData();
    const section = sectionFrom(form.get("section"));
    const { user } = await requireNewsRight(section, "canCreate");
    const title = String(form.get("title") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    const category = String(form.get("category") ?? "").trim();
    const pinned = form.get("pinned") === "true";
    const file = form.get("image");

    if (!title || !body) throw new ApiError(400, "Titel en tekst zijn verplicht.");

    const imageUrl = file instanceof File && file.size > 0 ? (await processAndStoreImage(file, { keyPrefix: "news" })).url : null;

    const post = await prisma.newsPost.create({
      data: { title, body, category: category || null, pinned, imageUrl, section, authorId: user.id },
      include: { author: { select: { name: true } } },
    });
    return NextResponse.json({ post });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
