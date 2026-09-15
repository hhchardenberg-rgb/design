import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    const photo = await prisma.stockPhoto.update({
      where: { id },
      data: { title: body.title, category: body.category, sortOrder: body.sortOrder },
    });
    return NextResponse.json({ photo });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    await prisma.stockPhoto.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
