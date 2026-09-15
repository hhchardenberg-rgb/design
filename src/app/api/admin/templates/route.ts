import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";

export async function GET() {
  try {
    await requireAdmin();
    const templates = await prisma.template.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        activeVersion: { select: { id: true, versionNumber: true, status: true } },
        versions: { select: { id: true, versionNumber: true, status: true }, orderBy: { versionNumber: "desc" } },
      },
    });
    return NextResponse.json({ templates });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const { id, ...data } = body;

    // Bij herstellen uit het archief (restoreFromArchive) niet blind naar
    // "DRAFT" zetten: als deze template al een actieve, gepubliceerde versie
    // had, moet hij weer "PUBLISHED" worden — anders raakt Template.status
    // uit sync met TemplateVersion.status van de actieve versie, en toont
    // het overzicht "concept" terwijl de template-builder voor diezelfde
    // versie nog "gepubliceerd" laat zien.
    let status = data.status;
    if (data.restoreFromArchive) {
      const existing = await prisma.template.findUnique({ where: { id }, select: { activeVersionId: true } });
      status = existing?.activeVersionId ? "PUBLISHED" : "DRAFT";
    }

    const template = await prisma.template.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        category: data.category,
        status,
        sortOrder: data.sortOrder,
        thumbnailUrl: data.thumbnailUrl,
      },
    });
    return NextResponse.json({ template });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
