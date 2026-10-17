import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { CLEANUP, collectUploadRefs, decideUpload } from "./cleanup";

/**
 * Opruimen op basis van verwijzingen, met wachttijd:
 *  - eigen uploads die geen enkel ontwerp gebruikt, worden eerst gemarkeerd
 *    en pas na CLEANUP.graceDays nog steeds ongebruikt verwijderd; wordt een
 *    upload intussen weer gebruikt, dan vervalt de markering;
 *  - ZIP's van batches verdwijnen na CLEANUP.zipDays (de afbeeldingen zelf
 *    blijven bij Mijn ontwerpen).
 * Templatebestanden, voorbeeldafbeeldingen en exports worden niet aangeraakt.
 */
export async function runDesignCleanup(now = new Date()) {
  const ids = new Set<string>();
  const urls = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.generatedDesign.findMany({
      select: { id: true, formData: true },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    for (const d of page) collectUploadRefs(d.formData, ids, urls);
    if (page.length < 500) break;
    cursor = page[page.length - 1].id;
  }

  const storage = getStorage();
  const result = { marked: 0, unmarked: 0, deleted: 0, deletedBytes: 0, zipsRemoved: 0, errors: 0 };
  const uploads = await prisma.uploadedAsset.findMany({
    select: { id: true, url: true, createdAt: true, orphanedAt: true, storageKey: true, bytes: true },
  });
  for (const upload of uploads) {
    const decision = decideUpload(upload, { ids, urls }, now);
    try {
      if (decision === "mark") {
        await prisma.uploadedAsset.update({ where: { id: upload.id }, data: { orphanedAt: now } });
        result.marked++;
      } else if (decision === "unmark") {
        await prisma.uploadedAsset.update({ where: { id: upload.id }, data: { orphanedAt: null } });
        result.unmarked++;
      } else if (decision === "delete") {
        // Eerst het record (dan kan niemand hem meer kiezen), dan het bestand.
        await prisma.uploadedAsset.delete({ where: { id: upload.id } });
        await storage.delete(upload.storageKey!);
        result.deleted++;
        result.deletedBytes += upload.bytes ?? 0;
      }
    } catch (error) {
      result.errors++;
      console.error(`[opruimen] upload ${upload.id}`, error);
    }
  }

  const zipBefore = new Date(now.getTime() - CLEANUP.zipDays * 24 * 3600 * 1000);
  const oldZips = await prisma.designBatch.findMany({
    where: { zipKey: { not: null }, createdAt: { lt: zipBefore } },
    select: { id: true, zipKey: true },
  });
  for (const b of oldZips) {
    try {
      await prisma.designBatch.update({ where: { id: b.id }, data: { zipUrl: null, zipKey: null } });
      await storage.delete(b.zipKey!);
      result.zipsRemoved++;
    } catch (error) {
      result.errors++;
      console.error(`[opruimen] zip ${b.id}`, error);
    }
  }

  console.log("[opruimen] klaar", result);
  return result;
}
