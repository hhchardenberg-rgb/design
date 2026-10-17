import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStorage, buildKey } from "@/lib/storage";
import { loadAssetBuffer } from "@/lib/render/loadAsset";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { importPsd, PsdImportError, ASSET_PREFIX, type ImportReport } from "./parse";
import { slugify } from "./naming";
import type { TemplateSchemaJson } from "@/lib/validations/template";

/**
 * PSD-import als taak met lease. Een taak die halverwege stopt (time-out
 * van de serverfunctie, herstart) blijft RUNNING met een verlopen lease en
 * wordt bij de volgende statusvraag opnieuw opgepakt, maximaal MAX_ATTEMPTS
 * keer. Een inhoudelijke fout in het bestand wordt niet herhaald.
 */
export const MAX_ATTEMPTS = 3;
const LEASE_MS = 150_000;

export interface ImportJobResult {
  templateId: string;
  versionId: string;
  warnings: { message: string }[];
}

export async function createImportJob(input: {
  sourceUrl: string;
  name: string;
  category: string;
  templateId: string | null;
  userId: string;
}) {
  return prisma.templateImportJob.create({
    data: {
      sourceUrl: input.sourceUrl,
      name: input.name,
      category: input.category,
      templateId: input.templateId,
      createdById: input.userId,
    },
  });
}

/** Of een taak (opnieuw) opgepakt mag worden. */
export function isClaimable(job: { status: string; leaseUntil: Date | null; attempts: number }, now = new Date()) {
  if (job.attempts >= MAX_ATTEMPTS) return false;
  if (job.status === "QUEUED") return true;
  return job.status === "RUNNING" && (!job.leaseUntil || job.leaseUntil < now);
}

/**
 * Voert een taak uit als niemand anders hem vasthoudt. Geeft de taak terug
 * zoals hij daarna in de database staat.
 */
export async function runImportJob(id: string) {
  const now = new Date();
  const claimed = await prisma.templateImportJob.updateMany({
    where: {
      id,
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ status: "QUEUED" }, { status: "RUNNING", OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }],
    },
    data: { status: "RUNNING", attempts: { increment: 1 }, leaseUntil: new Date(now.getTime() + LEASE_MS), error: null },
  });
  if (claimed.count === 0) {
    const job = await prisma.templateImportJob.findUniqueOrThrow({ where: { id } });
    // Na het laatste mislukte (verlopen) poging: definitief mislukt.
    if (job.status === "RUNNING" && job.attempts >= MAX_ATTEMPTS && job.leaseUntil && job.leaseUntil < now) {
      return prisma.templateImportJob.update({
        where: { id },
        data: { status: "FAILED", error: job.error ?? "De verwerking is te vaak afgebroken (bestand te groot of te complex)." },
      });
    }
    return job;
  }

  const job = await prisma.templateImportJob.findUniqueOrThrow({ where: { id } });
  try {
    const result = await processImport(job);
    return prisma.templateImportJob.update({
      where: { id },
      data: { status: "DONE", leaseUntil: null, result: result as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    const permanent = error instanceof PsdImportError || job.attempts >= MAX_ATTEMPTS;
    const message = error instanceof Error ? error.message : "Onbekende fout bij het importeren.";
    console.error(`[psd-import] taak ${id} poging ${job.attempts} mislukt`, error);
    return prisma.templateImportJob.update({
      where: { id },
      data: { status: permanent ? "FAILED" : "QUEUED", leaseUntil: null, error: message },
    });
  }
}

async function processImport(job: {
  id: string;
  sourceUrl: string;
  name: string;
  category: string;
  templateId: string | null;
  createdById: string;
}): Promise<ImportJobResult> {
  const buffer = await loadAssetBuffer(job.sourceUrl);
  const result = await importPsd(buffer);

  const storage = getStorage();
  const prefix = buildKey("templates", nanoid(10));
  const urls: Record<string, string> = {};
  for (const [name, data] of Object.entries(result.images)) {
    const stored = await storage.put({ key: buildKey(prefix, `${name}.png`), data, contentType: "image/png" });
    urls[name] = stored.url;
  }

  const resolve = (src: string | undefined) => (src?.startsWith(ASSET_PREFIX) ? urls[src.slice(ASSET_PREFIX.length)] ?? "" : src);
  const schema: TemplateSchemaJson = structuredClone(result.schema);
  for (const layer of schema.layers) {
    if (layer.type === "background" || layer.type === "static_image") layer.src = resolve(layer.src) ?? "";
    if (layer.type === "image" && layer.placeholderSrc) layer.placeholderSrc = resolve(layer.placeholderSrc);
  }
  const report: ImportReport = { ...result.report, referenceUrl: urls.reference, diffUrl: urls.diff };

  // Kleine voorbeeldafbeelding voor de templatebibliotheek (uit de Photoshop-samenstelling).
  let thumbnailUrl: string | null = null;
  if (result.images.reference) {
    const thumb = await sharp(result.images.reference).resize({ width: 600, height: 750, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    thumbnailUrl = (await storage.put({ key: buildKey(prefix, "thumbnail.webp"), data: thumb, contentType: "image/webp" })).url;
  }

  let template = job.templateId ? await prisma.template.findUnique({ where: { id: job.templateId } }) : null;
  if (job.templateId && !template) throw new PsdImportError("De template waarvoor deze import bedoeld was, bestaat niet meer.");
  if (!template) {
    const baseSlug = slugify(job.name);
    let slug = baseSlug;
    let i = 2;
    while (await prisma.template.findUnique({ where: { slug } })) slug = `${baseSlug}-${i++}`;
    template = await prisma.template.create({
      data: { slug, name: job.name, category: job.category, status: "DRAFT", createdById: job.createdById, thumbnailUrl },
    });
  } else if (!template.thumbnailUrl && thumbnailUrl) {
    template = await prisma.template.update({ where: { id: template.id }, data: { thumbnailUrl } });
  }

  for (let attempt = 0; ; attempt++) {
    const last = await prisma.templateVersion.findFirst({ where: { templateId: template.id }, orderBy: { versionNumber: "desc" } });
    try {
      const source = await prisma.templateAsset.create({ data: { kind: "SOURCE_PSD", url: job.sourceUrl, bytes: buffer.length } });
      const version = await prisma.templateVersion.create({
        data: {
          templateId: template.id,
          versionNumber: (last?.versionNumber ?? 0) + 1,
          status: "DRAFT",
          width: schema.width,
          height: schema.height,
          schemaJson: schema as unknown as Prisma.InputJsonValue,
          importReport: report as unknown as Prisma.InputJsonValue,
          sourcePsdAssetId: source.id,
          assets: {
            create: urls.background ? [{ kind: "BACKGROUND", url: urls.background, width: schema.width, height: schema.height }] : [],
          },
          fields: {
            create: result.fields.map((f) => ({
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
      return { templateId: template.id, versionId: version.id, warnings: result.warnings };
    } catch (error) {
      // Gelijktijdige import voor dezelfde template: volgend versienummer.
      if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
}

/** Importrapport-fouten die activeren blokkeren. */
export function reportErrors(report: unknown): string[] {
  const r = report as Partial<ImportReport> | null;
  return (r?.issues ?? []).filter((i) => i.severity === "error").map((i) => i.message);
}
