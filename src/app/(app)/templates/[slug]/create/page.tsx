import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateSchemaJson } from "@/lib/validations/template";
import { canAccessDesign } from "@/lib/design/permissions";
import { matchPrefill } from "@/lib/design/match-prefill";
import { fieldDefaults, formatName } from "@/lib/design/families";
import { Wizard } from "@/components/wizard/wizard";
import { listFontFaces } from "@/lib/fonts/faces.server";
import type { FormData } from "@/components/wizard/wizard";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const template = await prisma.template.findUnique({ where: { slug }, select: { name: true } });
  return { title: template ? template.name : "Ontwerp maken" };
}

export default async function CreateDesignPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ matchId?: string; designId?: string }>;
}) {
  const { slug } = await params;
  const { matchId, designId } = await searchParams;
  const session = await auth();
  const user = session!.user;

  const template = await prisma.template.findUnique({ where: { slug } });
  if (!template) notFound();

  // Een bestaand ontwerp opent altijd met zijn eigen (vastgepinde)
  // templateversie en eigen waarden, ook als er intussen een nieuwere
  // versie actief is. Overstappen is een aparte, expliciete actie.
  const design = designId
    ? await prisma.generatedDesign.findUnique({ where: { id: designId } })
    : null;
  if (designId && (!design || !canAccessDesign(user, design))) notFound();

  const versionId = design ? design.templateVersionId : template.activeVersionId;
  if (!versionId) notFound();
  if (!design && template.status !== "PUBLISHED") notFound();

  const version = await prisma.templateVersion.findUnique({
    where: { id: versionId },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (!version || version.templateId !== template.id) notFound();

  const schema = templateSchemaJson.parse(version.schemaJson);
  const [brandColors, fontFaces] = await Promise.all([
    prisma.brandColor.findMany({ orderBy: { sortOrder: "asc" } }),
    listFontFaces(),
  ]);

  const defaults: FormData = fieldDefaults(version.fields);

  let initialFormData: FormData = { ...defaults };
  if (design) {
    initialFormData = { ...defaults, ...(design.formData as FormData) };
  } else if (matchId) {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { team: true, opponent: true },
    });
    if (match) initialFormData = { ...defaults, ...matchPrefill(version.fields, match) };
  }

  const isActiveVersion = template.status === "PUBLISHED" && template.activeVersionId === version.id;
  const activeVersion =
    !isActiveVersion && template.status === "PUBLISHED" && template.activeVersionId
      ? await prisma.templateVersion.findUnique({ where: { id: template.activeVersionId }, select: { versionNumber: true } })
      : null;

  const variants = template.familyKey
    ? await prisma.template.findMany({
        where: { familyKey: template.familyKey, status: "PUBLISHED", id: { not: template.id }, activeVersionId: { not: null } },
        include: { activeVersion: { select: { width: true, height: true } } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      })
    : [];

  const lastExport = design
    ? await prisma.designExport.findFirst({ where: { designId: design.id, revision: design.revision }, orderBy: { createdAt: "desc" } })
    : null;

  return (
    <Wizard
      templateName={template.name}
      templateVersionId={version.id}
      versionInfo={{
        versionNumber: version.versionNumber,
        newerVersionNumber: activeVersion?.versionNumber ?? null,
      }}
      schema={schema}
      fields={version.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        placeholder: f.placeholder,
        maxLength: f.maxLength,
        textTransform: f.textTransform,
        defaultValue: f.defaultValue,
        options: (f.options as { label: string; value: string }[] | null) ?? null,
      }))}
      exportFormats={version.exportFormats}
      brandColors={brandColors.map((c) => ({ hex: c.hex, name: c.name }))}
      initialFormData={initialFormData}
      initialDesign={design ? { id: design.id, revision: design.revision, title: design.title } : null}
      initialExport={
        lastExport
          ? {
              id: lastExport.id,
              revision: lastExport.revision,
              format: lastExport.format,
              width: lastExport.width,
              height: lastExport.height,
              bytes: lastExport.bytes,
              url: lastExport.url,
              downloadUrl: `/api/designs/${design!.id}/exports/${lastExport.id}`,
            }
          : null
      }
      fontFaces={fontFaces}
      matchId={design ? design.matchId : (matchId ?? null)}
      formatVariants={variants.map((v) => ({
        templateId: v.id,
        slug: v.slug,
        label: formatName(v.formatLabel, v.activeVersion!.width, v.activeVersion!.height),
      }))}
    />
  );
}
