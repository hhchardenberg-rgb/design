import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTicketingAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";

export async function GET() {
  try {
    await requireTicketingAdmin();
    const templates = await prisma.ticketingEmailTemplate.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    });
    return NextResponse.json({ templates });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireTicketingAdmin();
    const body = await req.json();
    if (!body.title) throw new ApiError(400, "Titel is verplicht.");
    if (!body.body) throw new ApiError(400, "E-mailtekst is verplicht.");

    const template = await prisma.ticketingEmailTemplate.create({
      data: {
        title: body.title,
        subject: body.subject || null,
        body: body.body,
        category: body.category || null,
      },
    });
    return NextResponse.json({ template });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
