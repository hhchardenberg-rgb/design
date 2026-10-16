import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import {
  templateSchemaJson,
  type TemplateFieldInput,
  type TemplateSchemaJson,
} from "@/lib/validations/template";

/**
 * Levenscyclus van templateversies.
 *
 * Een versie die ooit actief is geweest (publishedAt gezet) is
 * onveranderlijk: ontwerpen zijn eraan vastgepind. Aanpassen gebeurt in een
 * nieuwe conceptversie, die daarna bewust geactiveerd wordt.
 */

export interface VersionIssue {
  severity: "error" | "warning";
  message: string;
}

const FIELD_TYPES_FOR_LAYER: Record<string, string[]> = {
  text: ["SHORT_TEXT", "LONG_TEXT", "NUMBER", "SCORE", "DATE", "TIME", "DROPDOWN"],
  image: ["IMAGE", "LOGO"],
  background: ["IMAGE", "LOGO"],
  color: ["BRAND_COLOR"],
};

/** Controleert schema en velden in samenhang. Fouten blokkeren opslaan of activeren. */
export function checkVersionDefinition(schema: TemplateSchemaJson, fields: TemplateFieldInput[]): VersionIssue[] {
  const issues: VersionIssue[] = [];
  const keys = new Set<string>();
  for (const f of fields) {
    if (keys.has(f.key)) issues.push({ severity: "error", message: `Veldnaam "${f.key}" komt dubbel voor.` });
    keys.add(f.key);
    if (f.type === "DROPDOWN" && !(f.options && f.options.length > 0)) {
      issues.push({ severity: "error", message: `Keuzelijst "${f.label}" heeft geen keuzes.` });
    }
  }
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const layerIds = new Set<string>();
  for (const layer of schema.layers) {
    const label = layer.name ?? layer.id;
    if (layerIds.has(layer.id)) issues.push({ severity: "error", message: `Laag-id "${layer.id}" komt dubbel voor.` });
    layerIds.add(layer.id);
    const geometry = [layer.x, layer.y, layer.width, layer.height];
    if (geometry.some((v) => !Number.isFinite(v)) || layer.width <= 0 || layer.height <= 0) {
      issues.push({ severity: "error", message: `Laag "${label}" heeft een ongeldige positie of afmeting.` });
    }
    if (layer.x >= schema.width || layer.y >= schema.height || layer.x + layer.width <= 0 || layer.y + layer.height <= 0) {
      issues.push({ severity: "warning", message: `Laag "${label}" valt volledig buiten het canvas en is niet zichtbaar.` });
    }
    if ("field" in layer && layer.field) {
      const f = byKey.get(layer.field);
      if (!f) {
        issues.push({ severity: "error", message: `Laag "${label}" verwijst naar het onbekende veld "${layer.field}".` });
      } else if (!(FIELD_TYPES_FOR_LAYER[layer.type] ?? []).includes(f.type)) {
        issues.push({ severity: "error", message: `Laag "${label}" past niet bij veldtype ${f.type} van "${f.label}".` });
      }
    }
    if (layer.visibilityField) {
      const f = byKey.get(layer.visibilityField);
      if (!f || f.type !== "CHECKBOX") {
        issues.push({ severity: "error", message: `Laag "${label}" gebruikt "${layer.visibilityField}" als aan/uit-veld, maar dat is geen aan/uit-veld.` });
      }
    }
    if ((layer.type === "background" || layer.type === "static_image") && !layer.src && !(layer.type === "background" && layer.field)) {
      issues.push({ severity: "error", message: `Laag "${label}" heeft geen afbeelding.` });
    }
  }
  return issues;
}

export function parseSchemaOrThrow(input: unknown): TemplateSchemaJson {
  const parsed = templateSchemaJson.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError(400, `Ongeldige templatedefinitie (${first?.path.join(".") || "schema"}): ${first?.message ?? "onbekend"}.`);
  }
  return parsed.data;
}

function throwOnErrors(issues: VersionIssue[]) {
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length > 0) throw new ApiError(400, errors.map((e) => e.message).join(" "));
}

export function isLockedVersion(version: { publishedAt: Date | null }): boolean {
  return version.publishedAt !== null;
}

function fieldRow(f: TemplateFieldInput) {
  return {
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
  };
}

/** Bewerkt een conceptversie. Een eerder actieve versie wordt geweigerd. */
export async function updateDraftVersion(
  templateId: string,
  versionId: string,
  input: { fields?: TemplateFieldInput[]; schemaJson?: unknown; exportFormats?: string[] }
) {
  const existing = await prisma.templateVersion.findUnique({ where: { id: versionId }, include: { fields: true } });
  if (!existing || existing.templateId !== templateId) throw new ApiError(404, "Versie niet gevonden.");
  if (isLockedVersion(existing)) {
    throw new ApiError(409, `Versie ${existing.versionNumber} is al in gebruik geweest en kan niet meer worden gewijzigd. Maak een nieuwe conceptversie.`);
  }

  const schema = parseSchemaOrThrow(input.schemaJson ?? existing.schemaJson);
  const fields: TemplateFieldInput[] =
    input.fields ??
    existing.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      defaultValue: f.defaultValue,
      placeholder: f.placeholder,
      maxLength: f.maxLength,
      textTransform: f.textTransform,
      options: (f.options as TemplateFieldInput["options"]) ?? null,
      imageFit: (f.imageFit as "contain" | "cover" | null) ?? null,
      imageAspectRatio: f.imageAspectRatio,
      allowTransparency: f.allowTransparency,
      sortOrder: f.sortOrder,
    }));
  throwOnErrors(checkVersionDefinition(schema, fields));
  if (schema.width !== existing.width || schema.height !== existing.height) {
    throw new ApiError(400, "De afmetingen van een versie kunnen niet worden gewijzigd.");
  }

  await prisma.$transaction(async (tx) => {
    if (input.fields) {
      await tx.templateField.deleteMany({ where: { templateVersionId: versionId } });
      await tx.templateField.createMany({ data: input.fields.map((f) => ({ templateVersionId: versionId, ...fieldRow(f) })) });
    }
    await tx.templateVersion.update({
      where: { id: versionId },
      data: {
        schemaJson: schema as unknown as Prisma.InputJsonValue,
        exportFormats: input.exportFormats,
      },
    });
  });
  return prisma.templateVersion.findUniqueOrThrow({ where: { id: versionId }, include: { fields: { orderBy: { sortOrder: "asc" } } } });
}

/** Nieuwe conceptversie als kopie van een bestaande versie (zelfde bestanden, nieuwe nummering). */
export async function createDraftFromVersion(templateId: string, fromVersionId: string) {
  const source = await prisma.templateVersion.findUnique({ where: { id: fromVersionId }, include: { fields: true, assets: true } });
  if (!source || source.templateId !== templateId) throw new ApiError(404, "Versie niet gevonden.");

  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await prisma.templateVersion.findFirst({ where: { templateId }, orderBy: { versionNumber: "desc" } });
    try {
      return await prisma.templateVersion.create({
        data: {
          templateId,
          versionNumber: (last?.versionNumber ?? 0) + 1,
          status: "DRAFT",
          width: source.width,
          height: source.height,
          schemaJson: source.schemaJson as Prisma.InputJsonValue,
          exportFormats: source.exportFormats,
          sourcePsdAssetId: source.sourcePsdAssetId,
          assets: {
            create: source.assets
              .filter((a) => a.kind !== "SOURCE_PSD")
              .map((a) => ({ kind: a.kind, url: a.url, width: a.width, height: a.height, bytes: a.bytes })),
          },
          fields: {
            create: source.fields.map((f) => ({
              key: f.key,
              label: f.label,
              type: f.type,
              required: f.required,
              defaultValue: f.defaultValue,
              placeholder: f.placeholder,
              maxLength: f.maxLength,
              textTransform: f.textTransform,
              options: f.options ?? undefined,
              imageFit: f.imageFit,
              imageAspectRatio: f.imageAspectRatio,
              allowTransparency: f.allowTransparency,
              sortOrder: f.sortOrder,
            })),
          },
        },
      });
    } catch (error) {
      // Gelijktijdig aangemaakte versie met hetzelfde nummer: opnieuw nummeren.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new ApiError(409, "Kon geen nieuw versienummer reserveren; probeer het opnieuw.");
}

/** Controles vóór activeren; geeft ook waarschuwingen terug. */
export async function activationIssues(versionId: string): Promise<VersionIssue[]> {
  const version = await prisma.templateVersion.findUniqueOrThrow({ where: { id: versionId }, include: { fields: true } });
  const parsed = templateSchemaJson.safeParse(version.schemaJson);
  if (!parsed.success) return [{ severity: "error", message: "De templatedefinitie is ongeldig." }];
  const fields = version.fields.map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    required: f.required,
    textTransform: f.textTransform,
    options: (f.options as TemplateFieldInput["options"]) ?? null,
    allowTransparency: f.allowTransparency,
    sortOrder: f.sortOrder,
  })) as TemplateFieldInput[];
  const issues = checkVersionDefinition(parsed.data, fields);
  if (version.exportFormats.length === 0) issues.push({ severity: "error", message: "Kies minstens één exportformaat." });
  return issues;
}

/**
 * Maakt een versie actief. Activeren is los van externe publicatie: het
 * betekent alleen dat nieuwe ontwerpen deze versie gebruiken. Bestaande
 * ontwerpen blijven op hun eigen versie.
 */
export async function activateVersion(templateId: string, versionId: string) {
  const version = await prisma.templateVersion.findUnique({ where: { id: versionId } });
  if (!version || version.templateId !== templateId) throw new ApiError(404, "Versie niet gevonden.");
  const issues = await activationIssues(versionId);
  throwOnErrors(issues);

  const template = await prisma.$transaction(async (tx) => {
    await tx.templateVersion.update({
      where: { id: versionId },
      data: { status: "PUBLISHED", publishedAt: version.publishedAt ?? new Date() },
    });
    return tx.template.update({ where: { id: templateId }, data: { activeVersionId: versionId, status: "PUBLISHED" } });
  });
  return { template, warnings: issues.filter((i) => i.severity === "warning") };
}
