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
    // anders blokkeert de Template.activeVersionId-koppeling zelf. Ontwerpen
    // die met dit template gemaakt zijn (GeneratedDesign.templateVersion)
    // hebben geen cascade-delete — die moeten dus expliciet eerst weg, anders
    // blokkeert de FK zodra het template een echt gebruikte versie heeft. Eén
    // transactie zodat er niets half verwijderd blijft wanneer een stap faalt.
    await prisma.$transaction([
      prisma.generatedDesign.deleteMany({ where: { templateVersion: { templateId: id } } }),
      prisma.template.update({ where: { id }, data: { activeVersionId: null } }),
      prisma.template.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
