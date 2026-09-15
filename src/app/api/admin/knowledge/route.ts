import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";

export async function GET() {
  try {
    await requireAdmin();
    const articles = await prisma.knowledgeArticle.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }] });
    return NextResponse.json({ articles });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    if (!body.title) throw new ApiError(400, "Titel is verplicht.");

    const article = await prisma.knowledgeArticle.create({
      data: {
        title: body.title,
        body: body.body || null,
        category: body.category || null,
      },
    });
    return NextResponse.json({ article });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
