import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";

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
    const body = await req.json();
    if (!body.title || !body.body) throw new ApiError(400, "Titel en tekst zijn verplicht.");

    const post = await prisma.newsPost.create({
      data: {
        title: body.title,
        body: body.body,
        category: body.category || null,
        pinned: body.pinned ?? false,
        authorId: admin.id,
      },
      include: { author: { select: { name: true } } },
    });
    return NextResponse.json({ post });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
