import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";
import { slugify } from "@/lib/psd/naming";

/**
 * Dupliceert een template inclusief de laatste versie en velden, zodat een
 * admin een variant kan maken (bv. "Matchday Vrouwen" op basis van
 * "Matchday") zonder opnieuw een PSD te hoeven importeren.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    const source = await prisma.template.findUniqueOrThrow({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: { fields: true },
        },
      },
    });

    const latestVersion = source.versions[0];

    const baseSlug = slugify(`${source.name}-kopie`);
    let slug = baseSlug;
    let i = 2;
    while (await prisma.template.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${i++}`;
    }

    const newTemplate = await prisma.template.create({
      data: {
        slug,
        name: `${source.name} (kopie)`,
        description: source.description,
        category: source.category,
        thumbnailUrl: source.thumbnailUrl,
        status: "DRAFT",
        createdById: admin.id,
      },
    });

    if (latestVersion) {
      await prisma.templateVersion.create({
        data: {
          templateId: newTemplate.id,
          versionNumber: 1,
          status: "DRAFT",
          width: latestVersion.width,
          height: latestVersion.height,
          schemaJson: latestVersion.schemaJson as object,
          exportFormats: latestVersion.exportFormats,
          sourcePsdAssetId: latestVersion.sourcePsdAssetId,
          fields: {
            create: latestVersion.fields.map((f) => ({
              key: f.key,
              label: f.label,
              type: f.type,
              required: f.required,
              defaultValue: f.defaultValue ?? undefined,
              placeholder: f.placeholder ?? undefined,
              maxLength: f.maxLength ?? undefined,
              textTransform: f.textTransform,
              options: f.options ?? undefined,
              imageFit: f.imageFit ?? undefined,
              imageAspectRatio: f.imageAspectRatio ?? undefined,
              allowTransparency: f.allowTransparency,
              sortOrder: f.sortOrder,
            })),
          },
        },
      });
    }

    const full = await prisma.template.findUniqueOrThrow({
      where: { id: newTemplate.id },
      include: { versions: { include: { fields: true } } },
    });

    return NextResponse.json({ template: full });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
