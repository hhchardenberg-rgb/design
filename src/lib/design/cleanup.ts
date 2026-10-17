/**
 * Welke eigen uploads een ontwerp gebruikt: via een assetverwijzing
 * ({kind: "upload", id}) of, bij oudere ontwerpen, alleen via de URL.
 */
export function collectUploadRefs(formData: unknown, ids: Set<string>, urls: Set<string>) {
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || depth > 6) return;
    if (Array.isArray(value)) {
      for (const v of value) visit(v, depth + 1);
      return;
    }
    const obj = value as Record<string, unknown>;
    const asset = obj.asset as { kind?: unknown; id?: unknown } | undefined;
    if (asset && asset.kind === "upload" && typeof asset.id === "string") ids.add(asset.id);
    if (typeof obj.assetUrl === "string") urls.add(obj.assetUrl);
    for (const v of Object.values(obj)) visit(v, depth + 1);
  };
  visit(formData, 0);
}

export const CLEANUP = {
  /** Een upload is pas na zoveel dagen een kandidaat (net geüpload, nog niet opgeslagen). */
  minUploadAgeDays: 7,
  /** Zo lang moet een upload ongebruikt blijven nadat dat is vastgesteld. */
  graceDays: 30,
  /** ZIP's van batches blijven zo lang staan; de losse exports blijven bestaan. */
  zipDays: 14,
};

export type UploadDecision = "keep" | "mark" | "unmark" | "delete";

/** Wat er met één upload gebeurt bij een opruimronde. */
export function decideUpload(
  upload: { id: string; url: string; createdAt: Date; orphanedAt: Date | null; storageKey: string | null },
  refs: { ids: Set<string>; urls: Set<string> },
  now: Date
): UploadDecision {
  const used = refs.ids.has(upload.id) || refs.urls.has(upload.url);
  if (used) return upload.orphanedAt ? "unmark" : "keep";
  const day = 24 * 3600 * 1000;
  if (now.getTime() - upload.createdAt.getTime() < CLEANUP.minUploadAgeDays * day) return "keep";
  // Zonder opslagsleutel (oude uploads) weten we niet zeker welk bestand het is.
  if (!upload.storageKey) return "keep";
  if (!upload.orphanedAt) return "mark";
  return now.getTime() - upload.orphanedAt.getTime() >= CLEANUP.graceDays * day ? "delete" : "keep";
}
