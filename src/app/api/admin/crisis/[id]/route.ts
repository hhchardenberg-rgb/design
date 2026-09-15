import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    const protocol = await prisma.crisisProtocol.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        whoToCall: body.whoToCall,
        whoMayCommunicate: body.whoMayCommunicate,
        steps: body.steps,
        sortOrder: body.sortOrder,
      },
    });
    return NextResponse.json({ protocol });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    await prisma.crisisProtocol.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
