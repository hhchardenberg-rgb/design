import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const template = await prisma.template.findUniqueOrThrow({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          include: { fields: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    return NextResponse.json({ template });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    // Een template met een actieve versie moet die koppeling eerst verliezen,
    // anders blokkeert de Template.activeVersionId-koppeling zelf (los van de
    // generieke FK-check in apiErrorResponse voor bv. ontwerpen die nog naar
    // een versie van dit template verwijzen). Eén transactie zodat het loskoppelen
    // niet blijft hangen wanneer de delete zelf alsnog faalt.
    await prisma.$transaction([
      prisma.template.update({ where: { id }, data: { activeVersionId: null } }),
      prisma.template.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
