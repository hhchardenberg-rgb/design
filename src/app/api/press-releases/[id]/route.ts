import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await prisma.pressRelease.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Persbericht niet gevonden.");
    if (existing.authorId !== user.id && user.role !== "ADMIN") {
      throw new ApiError(403, "Je kunt alleen je eigen persberichten bewerken.");
    }

    const body = await req.json();
    const release = await prisma.pressRelease.update({
      where: { id },
      data: {
        title: body.title,
        date: body.date ? new Date(body.date) : undefined,
        lead: body.lead,
        body: body.body,
      },
      include: { author: { select: { name: true } } },
    });
    return NextResponse.json({ release });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await prisma.pressRelease.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Persbericht niet gevonden.");
    if (existing.authorId !== user.id && user.role !== "ADMIN") {
      throw new ApiError(403, "Je kunt alleen je eigen persberichten verwijderen.");
    }

    await prisma.pressRelease.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
