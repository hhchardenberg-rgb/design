import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { templateSchemaJson } from "@/lib/validations/template";
import { TemplateBuilder, type BuilderField, type BuilderTemplate } from "./template-builder";

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
        include: { fields: { orderBy: { sortOrder: "asc" } } },
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
    versions: template.versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      status: v.status,
      width: v.width,
      height: v.height,
      schemaJson: templateSchemaJson.parse(v.schemaJson),
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

  return <TemplateBuilder template={builderTemplate} initialVersionId={versionId} />;
}
