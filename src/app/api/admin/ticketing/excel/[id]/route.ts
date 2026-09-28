import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTicketingAdmin, apiErrorResponse } from "@/lib/api-guards";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireTicketingAdmin();
    const { id } = await params;
    const body = await req.json();
    const template = await prisma.ticketingExcelTemplate.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        category: body.category,
        sortOrder: body.sortOrder,
      },
    });
    return NextResponse.json({ template });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireTicketingAdmin();
    const { id } = await params;
    await prisma.ticketingExcelTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
