import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    const agendaEvent = await prisma.agendaEvent.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        location: body.location,
        start: body.start ? new Date(body.start) : undefined,
        end: body.end === null ? null : body.end ? new Date(body.end) : undefined,
        isFullDay: body.isFullDay,
        highlighted: body.highlighted,
      },
    });
    return NextResponse.json({ agendaEvent });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    await prisma.agendaEvent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
