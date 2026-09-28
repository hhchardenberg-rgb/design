import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTicketingAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";

export async function GET() {
  try {
    await requireTicketingAdmin();
    const articles = await prisma.ticketingArticle.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }] });
    return NextResponse.json({ articles });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireTicketingAdmin();
    const body = await req.json();
    if (!body.title) throw new ApiError(400, "Titel is verplicht.");

    const article = await prisma.ticketingArticle.create({
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
