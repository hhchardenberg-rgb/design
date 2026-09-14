import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";

async function loadOwned(id: string, userId: string) {
  const design = await prisma.generatedDesign.findUnique({ where: { id } });
  if (!design || design.userId !== userId) throw new ApiError(404, "Ontwerp niet gevonden.");
  return design;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await loadOwned(id, user.id);
    const design = await prisma.generatedDesign.findUniqueOrThrow({
      where: { id },
      include: { templateVersion: { include: { template: true, fields: { orderBy: { sortOrder: "asc" } } } } },
    });
    return NextResponse.json({ design });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/** Autosave (zie MASTERPROMPT sectie 19): slaat tussentijdse veldwaarden op. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await loadOwned(id, user.id);
    const body = await req.json();

    const design = await prisma.generatedDesign.update({
      where: { id },
      data: {
        formData: body.formData ?? undefined,
        title: body.title ?? undefined,
        matchId: body.matchId !== undefined ? body.matchId : undefined,
      },
    });
    return NextResponse.json({ design });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await loadOwned(id, user.id);
    await prisma.generatedDesign.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
