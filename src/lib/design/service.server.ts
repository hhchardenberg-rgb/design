import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { Prisma, type TemplateField } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import type { AppRole } from "@/lib/roles";
import { getStorage, buildKey } from "@/lib/storage";
import { templateSchemaJson, type TemplateSchemaJson } from "@/lib/validations/template";
import { RENDERER_VERSION } from "@/lib/render/version";
import { canAccessDesign, canDesign } from "./permissions";
import {
  FormDataError,
  missingRequiredFields,
  normalizeFormData,
  stableStringify,
  type ValidationField,
} from "./form-data";
import { resolveDesignImages } from "./assets.server";

/**
 * Ontwerpen aanmaken, opslaan en exporteren, met alle controles die niet in
 * de browser thuishoren: rechten, invoer tegen de vastgepinde templateversie,
 * afbeeldingsautorisatie, revisiecontrole en een stabiele renderkey.
 */

export interface DesignUser {
  id: string;
  roles: AppRole[];
}

export const EXPORT_FORMATS = ["PNG", "JPG", "WEBP"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
const CONTENT_TYPES: Record<ExportFormat, string> = { PNG: "image/png", JPG: "image/jpeg", WEBP: "image/webp" };
export const EXTENSIONS: Record<ExportFormat, string> = { PNG: "png", JPG: "jpg", WEBP: "webp" };

export class DesignConflictError extends ApiError {
  constructor(public current: { revision: number; formData: unknown; updatedAt: Date }) {
    super(409, "Dit ontwerp is ondertussen ergens anders gewijzigd.");
  }
}

function toValidationFields(fields: TemplateField[]): ValidationField[] {
  return fields.map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    required: f.required,
    maxLength: f.maxLength,
    defaultValue: f.defaultValue,
    options: f.options,
  }));
}

async function allowedColors(fields: TemplateField[], schema: TemplateSchemaJson): Promise<Set<string>> {
  const colors = new Set<string>();
  for (const c of await prisma.brandColor.findMany({ select: { hex: true } })) colors.add(c.hex.toUpperCase());
  for (const f of fields) if (f.type === "BRAND_COLOR" && f.defaultValue) colors.add(f.defaultValue.toUpperCase());
  for (const l of schema.layers) if (l.type === "color") colors.add(l.defaultColor.toUpperCase());
  return colors;
}

/** Valideert, normaliseert en autoriseert invoer voor een bepaalde versie en eigenaar. */
export async function prepareFormData(
  version: { fields: TemplateField[]; schemaJson: unknown },
  ownerId: string,
  input: unknown
): Promise<Record<string, unknown>> {
  const schema = templateSchemaJson.parse(version.schemaJson);
  const fields = toValidationFields(version.fields);
  try {
    const normalized = normalizeFormData(fields, input, { allowedColors: await allowedColors(version.fields, schema) });
    return await resolveDesignImages(fields, normalized, { ownerId, schema });
  } catch (error) {
    if (error instanceof FormDataError) throw new ApiError(400, error.message);
    throw error;
  }
}

const designInclude = {
  templateVersion: { include: { fields: { orderBy: { sortOrder: "asc" } }, template: true } },
} satisfies Prisma.GeneratedDesignInclude;

export async function loadDesign(user: DesignUser, id: string) {
  const design = await prisma.generatedDesign.findUnique({ where: { id }, include: designInclude });
  if (!design || !canAccessDesign(user, design)) throw new ApiError(404, "Ontwerp niet gevonden.");
  return design;
}

/**
 * Maakt een concept aan. Wordt pas aangeroepen bij de eerste echte wijziging
 * (niet bij het openen van een template), en alleen op de actieve versie van
 * een gepubliceerde template.
 */
export async function createDesign(
  user: DesignUser,
  input: { templateVersionId: string; matchId?: string | null; title?: string | null; formData?: unknown }
) {
  if (!canDesign(user.roles, "design:create")) throw new ApiError(403, "Je hebt geen toegang tot de designtool.");
  const version = await prisma.templateVersion.findUnique({
    where: { id: input.templateVersionId },
    include: { template: true, fields: true },
  });
  if (!version || version.template.status !== "PUBLISHED" || version.template.activeVersionId !== version.id) {
    throw new ApiError(404, "Sjabloon niet gevonden.");
  }
  if (input.matchId && !(await prisma.match.findUnique({ where: { id: input.matchId }, select: { id: true } }))) {
    throw new ApiError(400, "Onbekende wedstrijd.");
  }
  const formData = await prepareFormData(version, user.id, input.formData ?? {});
  const title = cleanTitle(input.title) ?? version.template.name;

  return prisma.generatedDesign.create({
    data: {
      templateVersionId: version.id,
      userId: user.id,
      matchId: input.matchId ?? undefined,
      title,
      formData: formData as Prisma.InputJsonValue,
      width: version.width,
      height: version.height,
      status: "DRAFT",
      revision: 1,
    },
  });
}

/**
 * Slaat een nieuwe revisie op, maar alleen als de client op de huidige
 * revisie voortbouwt. Anders volgt een conflict met de actuele serverstaat,
 * zodat een trage of tweede tab nooit stilzwijgend nieuwer werk terugzet.
 */
export async function saveDesign(
  user: DesignUser,
  id: string,
  input: { baseRevision: number; formData?: unknown; title?: string | null }
) {
  const design = await loadDesign(user, id);
  if (!Number.isInteger(input.baseRevision)) throw new ApiError(400, "Revisie ontbreekt.");

  const formData =
    input.formData !== undefined
      ? await prepareFormData(design.templateVersion, design.userId, input.formData)
      : undefined;
  const title = input.title !== undefined ? cleanTitle(input.title) : undefined;

  const result = await prisma.generatedDesign.updateMany({
    where: { id, revision: input.baseRevision },
    data: {
      formData: formData as Prisma.InputJsonValue | undefined,
      title: title === undefined ? undefined : title,
      revision: { increment: 1 },
    },
  });
  if (result.count === 0) {
    const current = await prisma.generatedDesign.findUniqueOrThrow({ where: { id } });
    throw new DesignConflictError({ revision: current.revision, formData: current.formData, updatedAt: current.updatedAt });
  }
  return prisma.generatedDesign.findUniqueOrThrow({ where: { id } });
}

function cleanTitle(title: string | null | undefined): string | null | undefined {
  if (title === undefined) return undefined;
  if (title === null) return null;
  const t = String(title).trim().slice(0, 120);
  return t || null;
}

export function computeRenderKey(input: {
  designId: string;
  revision: number;
  templateVersionId: string;
  format: ExportFormat;
  fontFingerprint: string;
}): string {
  return createHash("sha256")
    .update(stableStringify({ ...input, rendererVersion: RENDERER_VERSION }))
    .digest("hex");
}

/**
 * Definitieve export van een opgeslagen revisie. Geeft een bestaand bestand
 * terug als dezelfde invoer al eerder is gerenderd (twee klikken = één
 * bestand). Rendert nooit niet-opgeslagen invoer en levert nooit een
 * gedeeltelijk bestand op.
 */
export async function exportDesign(user: DesignUser, id: string, input: { revision: number; format: string }) {
  const format = String(input.format ?? "PNG").toUpperCase() as ExportFormat;
  if (!EXPORT_FORMATS.includes(format)) throw new ApiError(400, "Ongeldig exportformaat.");

  const design = await loadDesign(user, id);
  if (input.revision !== design.revision) {
    throw new DesignConflictError({ revision: design.revision, formData: design.formData, updatedAt: design.updatedAt });
  }
  const version = design.templateVersion;
  if (!version.exportFormats.includes(format)) {
    throw new ApiError(400, `Formaat ${format} is niet beschikbaar voor deze template.`);
  }

  const formData = (design.formData ?? {}) as Record<string, unknown>;
  const missing = missingRequiredFields(toValidationFields(version.fields), formData);
  if (missing.length > 0) {
    throw new ApiError(400, `Nog in te vullen: ${missing.map((f) => f.label).join(", ")}.`);
  }

  const { activeFontFingerprint } = await import("@/lib/render/fonts");
  const renderKey = computeRenderKey({
    designId: design.id,
    revision: design.revision,
    templateVersionId: version.id,
    format,
    fontFingerprint: await activeFontFingerprint(),
  });

  const existing = await prisma.designExport.findUnique({ where: { renderKey } });
  if (existing) return { export: existing, design, reused: true };

  // De opgeslagen invoer opnieuw autoriseren: een bestand kan sinds het
  // opslaan verwijderd zijn, of (bij oudere ontwerpen) nooit gecontroleerd.
  const authorized = await prepareFormData(version, design.userId, formData);
  const schema = templateSchemaJson.parse(version.schemaJson);

  const { renderDesign, encodeCanvas, RenderError } = await import("@/lib/render/serverRender");
  let buffer: Buffer;
  try {
    const textTransforms = Object.fromEntries(version.fields.map((f) => [f.key, f.textTransform]));
    const canvas = await renderDesign(schema, authorized, { strict: true, textTransforms });
    buffer = await encodeCanvas(canvas, format, schema);
  } catch (error) {
    if (error instanceof RenderError) throw new ApiError(422, `${error.message} Er is geen bestand gemaakt.`);
    throw error;
  }

  const storage = getStorage();
  const key = buildKey("exports", design.userId, `${design.id}-r${design.revision}-${nanoid(6)}.${EXTENSIONS[format]}`);
  const stored = await storage.put({ key, data: buffer, contentType: CONTENT_TYPES[format] });

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.designExport.create({
        data: {
          designId: design.id,
          revision: design.revision,
          templateVersionId: version.id,
          renderKey,
          rendererVersion: RENDERER_VERSION,
          format,
          url: stored.url,
          storageKey: stored.key,
          width: schema.width,
          height: schema.height,
          bytes: buffer.length,
        },
      });
      // Velden die ook de oudere schermen (dashboard, Mijn ontwerpen) lezen.
      await tx.generatedDesign.update({
        where: { id: design.id },
        data: { status: "COMPLETED", exportUrl: stored.url, exportFormat: format, width: schema.width, height: schema.height },
      });
      return row;
    });
    return { export: created, design, reused: false };
  } catch (error) {
    // Gelijktijdige klik met dezelfde invoer: de ander was eerder klaar.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await storage.delete(stored.key);
      const winner = await prisma.designExport.findUniqueOrThrow({ where: { renderKey } });
      return { export: winner, design, reused: true };
    }
    await storage.delete(stored.key);
    throw error;
  }
}

/** Overzicht van wat er gebeurt bij overstappen naar de actieve templateversie. */
export async function planVersionSwitch(user: DesignUser, id: string) {
  const design = await loadDesign(user, id);
  const template = design.templateVersion.template;
  if (template.status !== "PUBLISHED" || !template.activeVersionId) {
    throw new ApiError(400, "Deze template heeft geen actieve versie.");
  }
  if (template.activeVersionId === design.templateVersionId) {
    throw new ApiError(400, "Dit ontwerp gebruikt de actieve versie al.");
  }
  const target = await prisma.templateVersion.findUniqueOrThrow({
    where: { id: template.activeVersionId },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  const formData = (design.formData ?? {}) as Record<string, unknown>;
  const targetByKey = new Map(target.fields.map((f) => [f.key, f]));
  const carried: string[] = [];
  const dropped: string[] = [];
  const mapped: Record<string, unknown> = {};
  for (const f of design.templateVersion.fields) {
    if (formData[f.key] === undefined) continue;
    const t = targetByKey.get(f.key);
    if (t && compatibleTypes(f.type, t.type)) {
      carried.push(t.label);
      mapped[f.key] = formData[f.key];
    } else {
      dropped.push(f.label);
    }
  }
  const added = target.fields.filter((f) => !design.templateVersion.fields.some((o) => o.key === f.key)).map((f) => f.label);
  return { design, target, mapped, report: { fromVersion: design.templateVersion.versionNumber, toVersion: target.versionNumber, carried, dropped, added } };
}

/**
 * Overstappen is een expliciete actie: er ontstaat een nieuw concept op de
 * actieve versie met de overgenomen waarden; het origineel blijft ongewijzigd.
 */
export async function switchDesignVersion(user: DesignUser, id: string) {
  const plan = await planVersionSwitch(user, id);
  // Per veld valideren: een waarde die in de nieuwe versie niet meer geldig
  // is (bv. een keuze die verdwenen is) valt weg en wordt gemeld, in plaats
  // van het overstappen te blokkeren.
  const formData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(plan.mapped)) {
    try {
      Object.assign(formData, await prepareFormData(plan.target, plan.design.userId, { [key]: value }));
    } catch {
      const label = plan.target.fields.find((f) => f.key === key)?.label ?? key;
      plan.report.carried = plan.report.carried.filter((l) => l !== label);
      plan.report.dropped.push(label);
    }
  }
  const created = await prisma.generatedDesign.create({
    data: {
      templateVersionId: plan.target.id,
      userId: plan.design.userId,
      matchId: plan.design.matchId,
      title: plan.design.title,
      formData: formData as Prisma.InputJsonValue,
      width: plan.target.width,
      height: plan.target.height,
      status: "DRAFT",
      revision: 1,
    },
  });
  return { design: created, report: plan.report };
}

function compatibleTypes(a: string, b: string): boolean {
  if (a === b) return true;
  const text = ["SHORT_TEXT", "LONG_TEXT", "DATE", "TIME"];
  const image = ["IMAGE", "LOGO"];
  const num = ["NUMBER", "SCORE"];
  return [text, image, num].some((g) => g.includes(a) && g.includes(b));
}

/** Kopie van een eigen ontwerp als nieuw concept op dezelfde versie. */
export async function duplicateDesign(user: DesignUser, id: string) {
  const design = await loadDesign(user, id);
  if (!canDesign(user.roles, "design:create")) throw new ApiError(403, "Je hebt geen toegang tot de designtool.");
  const formData = await prepareFormData(design.templateVersion, user.id, design.formData ?? {}).catch(() => {
    throw new ApiError(400, "Dit ontwerp bevat afbeeldingen die je niet mag gebruiken; kopiëren kan niet.");
  });
  return prisma.generatedDesign.create({
    data: {
      templateVersionId: design.templateVersionId,
      userId: user.id,
      matchId: design.matchId,
      title: `${design.title ?? design.templateVersion.template.name} (kopie)`.slice(0, 120),
      formData: formData as Prisma.InputJsonValue,
      width: design.width,
      height: design.height,
      status: "DRAFT",
      revision: 1,
    },
  });
}
