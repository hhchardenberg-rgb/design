import { prisma } from "@/lib/prisma";
import type { RecordCtx } from "./ctx.server";

const INLINE_IMAGES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Per dossier het actuele logo met een voorbeeld (nieuwste upload), voor in lijsten en koppen. */
export async function currentLogoIds(ctx: RecordCtx, companyIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ctx.can("files:read") || companyIds.length === 0) return out;
  const rows = await prisma.commercialFile.findMany({
    where: { companyId: { in: companyIds }, category: "LOGO", archivedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, companyId: true, previewKey: true, mimeType: true },
  });
  for (const r of rows) if (!out.has(r.companyId) && (r.previewKey || INLINE_IMAGES.has(r.mimeType))) out.set(r.companyId, r.id);
  return out;
}
