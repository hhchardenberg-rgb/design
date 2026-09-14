import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { templateFieldInputSchema } from "@/lib/validations/template";
import { z } from "zod";

const patchSchema = z.object({
  fields: z.array(templateFieldInputSchema).optional(),
  schemaJson: z.record(z.string(), z.unknown()).optional(),
  exportFormats: z.array(z.enum(["PNG", "JPG", "WEBP"])).optional(),
  publish: z.boolean().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    await requireAdmin();
    const { versionId } = await params;
    const version = await prisma.templateVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { fields: { orderBy: { sortOrder: "asc" } }, template: true },
    });
    return NextResponse.json({ version });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    await requireAdmin();
    const { id, versionId } = await params;
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.templateVersion.findUniqueOrThrow({ where: { id: versionId } });
    if (existing.templateId !== id) throw new ApiError(400, "Versie hoort niet bij deze template.");

    await prisma.$transaction(async (tx) => {
      if (body.fields) {
        await tx.templateField.deleteMany({ where: { templateVersionId: versionId } });
        await tx.templateField.createMany({
          data: body.fields.map((f) => ({
            templateVersionId: versionId,
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
        });
      }

      await tx.templateVersion.update({
        where: { id: versionId },
        data: {
          schemaJson: body.schemaJson ? (body.schemaJson as object) : undefined,
          exportFormats: body.exportFormats,
          status: body.publish ? "PUBLISHED" : undefined,
          publishedAt: body.publish ? new Date() : undefined,
        },
      });

      if (body.publish) {
        await tx.template.update({
          where: { id },
          data: { activeVersionId: versionId, status: "PUBLISHED" },
        });
      }
    });

    const version = await prisma.templateVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { fields: { orderBy: { sortOrder: "asc" } } },
    });
    return NextResponse.json({ version });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
