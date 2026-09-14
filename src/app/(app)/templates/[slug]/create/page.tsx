import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateSchemaJson } from "@/lib/validations/template";
import { Wizard } from "@/components/wizard/wizard";
import type { FormData } from "@/components/wizard/wizard";

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
  const userId = session!.user.id;

  const template = await prisma.template.findUnique({
    where: { slug },
    include: { activeVersion: { include: { fields: { orderBy: { sortOrder: "asc" } } } } },
  });

  if (!template || !template.activeVersion || template.status !== "PUBLISHED") {
    notFound();
  }

  const version = template.activeVersion;
  const schema = templateSchemaJson.parse(version.schemaJson);
  const brandColors = await prisma.brandColor.findMany({ orderBy: { sortOrder: "asc" } });

  let initialFormData: FormData = {};
  for (const field of version.fields) {
    if (field.type === "CHECKBOX") {
      initialFormData[field.key] = field.defaultValue !== "false";
    } else if (field.defaultValue) {
      initialFormData[field.key] = field.defaultValue;
    }
  }

  let existingDesignId: string | null = null;

  if (designId) {
    const design = await prisma.generatedDesign.findUnique({ where: { id: designId } });
    if (design && design.userId === userId && design.templateVersionId === version.id) {
      initialFormData = { ...initialFormData, ...(design.formData as FormData) };
      existingDesignId = design.id;
    }
  } else if (matchId) {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { team: true, opponent: true },
    });
    if (match) {
      const fieldKeys = new Set(version.fields.map((f) => f.key));
      const opponentName = match.isHome ? match.opponent.name : match.team.name;
      const opponentLogo = match.isHome ? match.opponent.logoUrl : match.team.logoUrl;
      if (fieldKeys.has("opponent")) initialFormData.opponent = opponentName;
      if (fieldKeys.has("opponent_logo") && opponentLogo) {
        initialFormData.opponent_logo = { assetUrl: opponentLogo, scale: 1 };
      }
      if (fieldKeys.has("competition") && match.competition) initialFormData.competition = match.competition;
      if (fieldKeys.has("location") && match.location) initialFormData.location = match.location;
      if (fieldKeys.has("date")) {
        const formatted = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(match.date);
        initialFormData.date = formatted.charAt(0).toUpperCase() + formatted.slice(1);
      }
      if (fieldKeys.has("time")) {
        initialFormData.time = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(match.date);
      }
      if (fieldKeys.has("score_home") && match.scoreHome !== null) initialFormData.score_home = String(match.scoreHome);
      if (fieldKeys.has("score_away") && match.scoreAway !== null) initialFormData.score_away = String(match.scoreAway);
    }
  }

  return (
    <Wizard
      templateName={template.name}
      templateVersionId={version.id}
      schema={schema}
      fields={version.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        placeholder: f.placeholder,
        maxLength: f.maxLength,
        options: (f.options as { label: string; value: string }[] | null) ?? null,
      }))}
      exportFormats={version.exportFormats}
      brandColors={brandColors.map((c) => ({ hex: c.hex, name: c.name }))}
      initialFormData={initialFormData}
      initialDesignId={existingDesignId}
      matchId={matchId ?? null}
    />
  );
}
