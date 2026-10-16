import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, ApiError } from "@/lib/api-guards";
import { loadDesign, saveDesign } from "@/lib/design/service.server";
import { designErrorResponse } from "@/lib/design/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const design = await loadDesign(user, id);
    return NextResponse.json({ design });
  } catch (error) {
    return designErrorResponse(error);
  }
}

/**
 * Autosave: slaat een nieuwe revisie op. `baseRevision` is de revisie waar
 * de client op voortbouwt; bij een afwijking volgt 409 met de serverstaat.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw new ApiError(400, "Ongeldige invoer.");
    const design = await saveDesign(user, id, {
      baseRevision: Number(body.baseRevision),
      formData: body.formData,
      title: body.title === undefined ? undefined : body.title === null ? null : String(body.title),
    });
    return NextResponse.json({ design: { id: design.id, revision: design.revision, updatedAt: design.updatedAt, formData: design.formData } });
  } catch (error) {
    return designErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await loadDesign(user, id);
    await prisma.generatedDesign.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return designErrorResponse(error);
  }
}
