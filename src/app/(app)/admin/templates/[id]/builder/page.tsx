import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { templateSchemaJson } from "@/lib/validations/template";
import { listFontFaces } from "@/lib/fonts/faces.server";
import type { ImportReport } from "@/lib/psd/parse";
import { TemplateBuilder, type BuilderField, type BuilderTemplate } from "./template-builder";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const template = await prisma.template.findUnique({ where: { id }, select: { name: true } });
  return { title: template ? `${template.name} bewerken` : "Template bewerken" };
}

export default async function TemplateBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ versionId?: string }>;
}) {
  const { id } = await params;
  const { versionId } = await searchParams;

  const template = await prisma.template.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        include: { fields: { orderBy: { sortOrder: "asc" } }, _count: { select: { generatedDesigns: true } } },
      },
    },
  });

  if (!template || template.versions.length === 0) notFound();

  const builderTemplate: BuilderTemplate = {
    id: template.id,
    name: template.name,
    category: template.category,
    description: template.description,
    status: template.status,
    activeVersionId: template.activeVersionId,
    versions: template.versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      status: v.status,
      locked: v.publishedAt !== null,
      designCount: v._count.generatedDesigns,
      width: v.width,
      height: v.height,
      schemaJson: templateSchemaJson.parse(v.schemaJson),
      importReport: (v.importReport as unknown as ImportReport | null) ?? null,
      exportFormats: v.exportFormats,
      fields: v.fields.map(
        (f): BuilderField => ({
          key: f.key,
          label: f.label,
          type: f.type,
          required: f.required,
          defaultValue: f.defaultValue,
          placeholder: f.placeholder,
          maxLength: f.maxLength,
          textTransform: f.textTransform,
          options: (f.options as { label: string; value: string }[] | null) ?? null,
          imageFit: (f.imageFit as "contain" | "cover" | null) ?? null,
          sortOrder: f.sortOrder,
        })
      ),
    })),
  };

  const fontFaces = await listFontFaces();

  return (
    <TemplateBuilder
      key={versionId ?? "laatste"}
      template={builderTemplate}
      initialVersionId={versionId}
      fontFaces={fontFaces}
    />
  );
}
