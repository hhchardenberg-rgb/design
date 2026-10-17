import JSZip from "jszip";
import { nanoid } from "nanoid";
import type { DesignBatch, DesignBatchItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { getStorage, buildKey } from "@/lib/storage";
import { loadAssetBuffer } from "@/lib/render/loadAsset";
import { slugify } from "@/lib/psd/naming";
import { canDesign } from "./permissions";
import { fieldDefaults, formatName } from "./families";
import { matchPrefill, playerPrefill } from "./match-prefill";
import { createDesign, exportDesign, EXPORT_FORMATS, EXTENSIONS, type DesignUser, type ExportFormat } from "./service.server";

/**
 * Batchproductie: één of meer templates (formaten van een familie) voor een
 * reeks wedstrijden of spelers. Elk onderdeel wordt een gewoon ontwerp met
 * een export; aan het eind komen alle bestanden in één ZIP.
 *
 * Duurzaam zoals de PSD-import: batch en onderdelen hebben een lease. Wie de
 * status opvraagt, werkt een stuk af binnen een tijdsbudget; een afgebroken
 * serverfunctie laat een verlopen lease achter en het werk gaat bij de
 * volgende vraag verder. Een onderdeel wordt maximaal MAX_ATTEMPTS keer
 * geprobeerd; een inhoudelijke fout (ontbrekend veld, tekst past niet) niet
 * opnieuw.
 */

export const MAX_BATCH_ITEMS = 60;
export const MAX_ATTEMPTS = 3;
const ITEM_LEASE_MS = 90_000;
const BATCH_LEASE_MS = 70_000;

export type BatchSource = "match" | "player";

export async function createBatch(
  user: DesignUser,
  input: { templateIds: string[]; source: BatchSource; sourceIds: string[]; format: string }
) {
  if (!canDesign(user.roles, "design:create")) throw new ApiError(403, "Je hebt geen toegang tot de designtool.");
  const format = input.format.toUpperCase() as ExportFormat;
  if (!EXPORT_FORMATS.includes(format)) throw new ApiError(400, "Ongeldig exportformaat.");
  const templateIds = [...new Set(input.templateIds)];
  const sourceIds = [...new Set(input.sourceIds)];
  if (templateIds.length === 0) throw new ApiError(400, "Kies minstens één template.");
  if (sourceIds.length === 0) throw new ApiError(400, input.source === "match" ? "Kies minstens één wedstrijd." : "Kies minstens één speler.");
  if (templateIds.length * sourceIds.length > MAX_BATCH_ITEMS) {
    throw new ApiError(400, `Maximaal ${MAX_BATCH_ITEMS} afbeeldingen per keer; kies minder ${input.source === "match" ? "wedstrijden" : "spelers"} of formaten.`);
  }

  const templates = await prisma.template.findMany({
    where: { id: { in: templateIds }, status: "PUBLISHED", activeVersionId: { not: null } },
    include: { activeVersion: { select: { exportFormats: true, width: true, height: true } } },
  });
  if (templates.length !== templateIds.length) throw new ApiError(400, "Een van de gekozen templates is niet (meer) beschikbaar.");
  for (const t of templates) {
    if (!t.activeVersion!.exportFormats.includes(format)) throw new ApiError(400, `${t.name} kan niet als ${format} worden gemaakt.`);
  }

  const labels = new Map<string, string>();
  if (input.source === "match") {
    const matches = await prisma.match.findMany({ where: { id: { in: sourceIds } }, include: { opponent: true, team: true } });
    for (const m of matches) labels.set(m.id, `${m.team.name} - ${m.opponent.name} ${formatDate(m.date)}`);
  } else {
    const players = await prisma.player.findMany({ where: { id: { in: sourceIds } } });
    for (const p of players) labels.set(p.id, `${p.firstName} ${p.lastName}`.trim());
  }
  if (labels.size !== sourceIds.length) throw new ApiError(400, "Een van de gekozen items bestaat niet meer.");

  const ordered = templateIds.map((id) => templates.find((t) => t.id === id)!);
  const title =
    ordered.length === 1 ? `${ordered[0].name} (${sourceIds.length}×)` : `${ordered[0].familyKey ?? ordered[0].name}: ${ordered.length} formaten (${sourceIds.length}×)`;

  let sortOrder = 0;
  return prisma.designBatch.create({
    data: {
      userId: user.id,
      title: title.slice(0, 120),
      format,
      items: {
        create: sourceIds.flatMap((sourceId) =>
          ordered.map((t) => ({
            sortOrder: sortOrder++,
            templateId: t.id,
            sourceKind: input.source,
            sourceId,
            label: ordered.length > 1 ? `${labels.get(sourceId)} · ${formatName(t.formatLabel, t.activeVersion!.width, t.activeVersion!.height)}` : labels.get(sourceId)!,
          }))
        ),
      },
    },
  });
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Amsterdam" })
    .format(date)
    .replace(/-/g, "/");
}

export async function loadBatch(user: DesignUser, id: string) {
  const batch = await prisma.designBatch.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!batch || batch.userId !== user.id) throw new ApiError(404, "Batch niet gevonden.");
  return batch;
}

/** Werkt de batch verder af binnen `budgetMs` en geeft de actuele stand terug. */
export async function runBatch(user: DesignUser, id: string, budgetMs = 40_000) {
  const start = Date.now();
  let batch = await loadBatch(user, id);
  if (batch.status === "DONE" || batch.status === "FAILED") return batch;

  const now = new Date();
  const claimed = await prisma.designBatch.updateMany({
    where: { id, status: { in: ["QUEUED", "RUNNING"] }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { status: "RUNNING", leaseUntil: new Date(now.getTime() + BATCH_LEASE_MS) },
  });
  // Iemand anders (tweede tabblad) is er al mee bezig.
  if (claimed.count === 0) return batch;

  try {
    while (Date.now() - start < budgetMs) {
      const item = await claimNextItem(id);
      if (!item) break;
      await processItem(user, batch, item);
    }
    const remaining = await prisma.designBatchItem.count({ where: { batchId: id, status: { in: ["QUEUED", "RUNNING"] } } });
    if (remaining === 0) {
      await finishBatch(id).catch(async (error) => {
        console.error(`[batch] ZIP voor ${id} mislukt`, error);
        await prisma.designBatch.update({ where: { id }, data: { error: "De ZIP maken is mislukt; dat wordt opnieuw geprobeerd." } });
      });
    }
  } finally {
    await prisma.designBatch.updateMany({ where: { id, status: "RUNNING" }, data: { leaseUntil: null } });
  }
  batch = await loadBatch(user, id);
  return batch;
}

async function claimNextItem(batchId: string): Promise<DesignBatchItem | null> {
  const now = new Date();
  for (let i = 0; i < 5; i++) {
    const next = await prisma.designBatchItem.findFirst({
      where: {
        batchId,
        attempts: { lt: MAX_ATTEMPTS },
        OR: [{ status: "QUEUED" }, { status: "RUNNING", leaseUntil: { lt: now } }],
      },
      orderBy: { sortOrder: "asc" },
    });
    if (!next) {
      // Onderdelen die te vaak zijn afgebroken: definitief mislukt.
      await prisma.designBatchItem.updateMany({
        where: { batchId, status: "RUNNING", attempts: { gte: MAX_ATTEMPTS }, leaseUntil: { lt: now } },
        data: { status: "FAILED", leaseUntil: null, error: "De verwerking is te vaak afgebroken." },
      });
      return null;
    }
    const ok = await prisma.designBatchItem.updateMany({
      where: { id: next.id, status: next.status, attempts: next.attempts },
      data: { status: "RUNNING", attempts: { increment: 1 }, leaseUntil: new Date(Date.now() + ITEM_LEASE_MS), error: null },
    });
    if (ok.count === 1) return { ...next, status: "RUNNING", attempts: next.attempts + 1 };
  }
  return null;
}

async function processItem(user: DesignUser, batch: DesignBatch, item: DesignBatchItem) {
  try {
    // Een eerdere poging kan het ontwerp al hebben gemaakt.
    let designId = item.designId;
    if (!designId) {
      const template = await prisma.template.findUnique({
        where: { id: item.templateId },
        include: { activeVersion: { include: { fields: true } } },
      });
      if (!template?.activeVersion || template.status !== "PUBLISHED") throw new ApiError(400, "De template is niet meer beschikbaar.");
      const fields = template.activeVersion.fields;
      let prefill: Record<string, unknown>;
      let matchId: string | null = null;
      if (item.sourceKind === "match") {
        const match = await prisma.match.findUnique({ where: { id: item.sourceId }, include: { team: true, opponent: true } });
        if (!match) throw new ApiError(400, "De wedstrijd bestaat niet meer.");
        prefill = matchPrefill(fields, match);
        matchId = match.id;
      } else {
        const player = await prisma.player.findUnique({ where: { id: item.sourceId }, include: { team: true } });
        if (!player) throw new ApiError(400, "De speler bestaat niet meer.");
        prefill = playerPrefill(fields, player);
      }
      const design = await createDesign(user, {
        templateVersionId: template.activeVersion.id,
        matchId,
        title: `${template.name} · ${item.label}`.slice(0, 120),
        formData: { ...fieldDefaults(fields), ...prefill },
      });
      designId = design.id;
      await prisma.designBatchItem.update({ where: { id: item.id }, data: { designId } });
    }
    const design = await prisma.generatedDesign.findUniqueOrThrow({ where: { id: designId }, select: { revision: true } });
    const result = await exportDesign(user, designId, { revision: design.revision, format: batch.format });
    await prisma.designBatchItem.update({
      where: { id: item.id },
      data: { status: "DONE", exportId: result.export.id, leaseUntil: null, error: null },
    });
  } catch (error) {
    // Een inhoudelijke fout (4xx) wordt niet herhaald, een storing wel.
    const permanent = (error instanceof ApiError && error.status < 500) || item.attempts >= MAX_ATTEMPTS;
    const message = error instanceof Error ? error.message : "Onbekende fout.";
    if (!(error instanceof ApiError)) console.error(`[batch] onderdeel ${item.id} poging ${item.attempts} mislukt`, error);
    await prisma.designBatchItem.update({
      where: { id: item.id },
      data: { status: permanent ? "FAILED" : "QUEUED", leaseUntil: null, error: message.slice(0, 500) },
    });
  }
}

/** Alle gelukte exports in één ZIP; mislukte onderdelen blijven zichtbaar. */
async function finishBatch(id: string) {
  const batch = await prisma.designBatch.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  const done = batch.items.filter((i) => i.status === "DONE" && i.exportId);
  if (done.length === 0) {
    await prisma.designBatch.update({ where: { id }, data: { status: "FAILED", error: "Geen enkele afbeelding kon worden gemaakt." } });
    return;
  }
  const exports = await prisma.designExport.findMany({ where: { id: { in: done.map((i) => i.exportId!) } } });
  const zip = new JSZip();
  const used = new Set<string>();
  const ext = EXTENSIONS[batch.format as ExportFormat] ?? "png";
  for (const [n, item] of done.entries()) {
    const row = exports.find((e) => e.id === item.exportId);
    if (!row) continue;
    let name = `${String(n + 1).padStart(2, "0")}-${slugify(item.label).replace(/_/g, "-").slice(0, 70)}`;
    while (used.has(name)) name += "-2";
    used.add(name);
    zip.file(`${name}.${ext}`, await loadAssetBuffer(row.url));
  }
  // Afbeeldingen zijn al gecomprimeerd; opslaan zonder extra compressie is sneller.
  const data = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  const storage = getStorage();
  const stored = await storage.put({ key: buildKey("batches", batch.userId, `${id}-${nanoid(8)}.zip`), data, contentType: "application/zip" });
  if (batch.zipKey) await storage.delete(batch.zipKey).catch(() => undefined);
  await prisma.designBatch.update({
    where: { id },
    data: { status: "DONE", zipUrl: stored.url, zipKey: stored.key, zipBytes: data.length, leaseUntil: null, error: null },
  });
}

/** Mislukte onderdelen opnieuw proberen. */
export async function retryBatch(user: DesignUser, id: string) {
  const batch = await loadBatch(user, id);
  const failed = batch.items.filter((i) => i.status === "FAILED");
  if (failed.length === 0) throw new ApiError(400, "Er is niets mislukt om opnieuw te proberen.");
  await prisma.$transaction([
    prisma.designBatchItem.updateMany({ where: { batchId: id, status: "FAILED" }, data: { status: "QUEUED", attempts: 0, error: null } }),
    prisma.designBatch.update({ where: { id }, data: { status: "QUEUED", error: null, leaseUntil: null } }),
  ]);
  return loadBatch(user, id);
}

export function batchResponse(batch: Awaited<ReturnType<typeof loadBatch>>) {
  return {
    id: batch.id,
    title: batch.title,
    format: batch.format,
    status: batch.status,
    error: batch.error,
    zip: batch.zipUrl ? { url: `/api/batches/${batch.id}/zip`, bytes: batch.zipBytes } : null,
    createdAt: batch.createdAt,
    items: batch.items.map((i) => ({
      id: i.id,
      label: i.label,
      status: i.status,
      error: i.error,
      designId: i.designId,
      exportId: i.exportId,
    })),
  };
}
