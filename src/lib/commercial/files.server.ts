import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { getStorage } from "@/lib/storage";
import { auditRecord, need, notFound, type RecordCtx } from "./ctx.server";
import { visibleCompany } from "./companies.server";

export const FILE_CATEGORIES = ["LOGO", "CONTRACT", "QUOTE", "AD", "PROOF", "OTHER"] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];
export const FILE_CATEGORY_LABELS: Record<FileCategory, string> = {
  LOGO: "Logo",
  CONTRACT: "Contract",
  QUOTE: "Offerte",
  AD: "Advertentie of materiaal",
  PROOF: "Uitvoeringsbewijs",
  OTHER: "Overig",
};

/** Een bewust korte lijst; SVG en HTML ontbreken omdat ze scripts kunnen bevatten. */
const ALLOWED: Record<string, { mime: string; magic?: number[] }> = {
  pdf: { mime: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  png: { mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  jpg: { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  jpeg: { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  webp: { mime: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: [0x50, 0x4b] },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: [0x50, 0x4b] },
  txt: { mime: "text/plain" },
};
/** Past binnen de bodylimiet van een serverless functie. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const INLINE_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

export function cleanFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "bestand";
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f"<>:|?*]/g, "").replace(/\.\.+/g, ".").trim().slice(0, 150) || "bestand";
}

/** Controleert extensie en de eerste bytes; het door de browser opgegeven type wordt niet vertrouwd. */
export function inspectUpload(name: string, data: Buffer): { mime: string } {
  if (data.length === 0) throw new ApiError(400, "Het bestand is leeg.");
  if (data.length > MAX_FILE_BYTES) throw new ApiError(413, "Het bestand is groter dan 4 MB.");
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const rule = ALLOWED[ext];
  if (!rule) throw new ApiError(400, "Dit bestandstype is niet toegestaan. Kies PDF, PNG, JPG, WEBP, DOCX, XLSX of TXT.");
  if (rule.magic && !rule.magic.every((b, i) => data[i] === b)) throw new ApiError(400, "De inhoud van het bestand past niet bij de extensie.");
  return { mime: rule.mime };
}

const publicFile = (f: {
  id: string; companyId: string; category: string; name: string; mimeType: string; sizeBytes: number;
  versionGroup: string; version: number; note: string | null; archivedAt: Date | null; createdAt: Date; uploadedById: string | null;
}) => ({
  id: f.id, companyId: f.companyId, category: f.category, name: f.name, mimeType: f.mimeType, sizeBytes: f.sizeBytes,
  versionGroup: f.versionGroup, version: f.version, note: f.note, createdAt: f.createdAt, uploadedById: f.uploadedById,
  previewable: INLINE_MIME.has(f.mimeType) && f.mimeType.startsWith("image/"),
});

export async function listFiles(ctx: RecordCtx, companyId: string, opts: { history?: boolean } = {}) {
  need(ctx, "files:read");
  await visibleCompany(ctx, companyId);
  const rows = await prisma.commercialFile.findMany({
    where: { companyId, ...(opts.history ? {} : { archivedAt: null }) },
    orderBy: [{ createdAt: "desc" }],
  });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.uploadedById).filter(Boolean) as string[])] } }, select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  // Alleen de hoogste actieve versie per groep tonen, tenzij geschiedenis gevraagd is.
  const newest = new Map<string, number>();
  for (const r of rows) if (!r.archivedAt) newest.set(r.versionGroup, Math.max(newest.get(r.versionGroup) ?? 0, r.version));
  return rows
    .filter((r) => opts.history || r.version === newest.get(r.versionGroup))
    .map((r) => ({ ...publicFile(r), uploadedBy: r.uploadedById ? nameOf.get(r.uploadedById) ?? null : null, current: !r.archivedAt && r.version === newest.get(r.versionGroup) }));
}

export async function uploadFile(
  ctx: RecordCtx,
  companyId: string,
  input: { name: string; data: Buffer; category: string; note?: string | null; replacesId?: string | null },
) {
  need(ctx, "files:create");
  const company = await visibleCompany(ctx, companyId);
  if (company.archivedAt) throw new ApiError(409, "Dit dossier is gearchiveerd.");
  if (!(FILE_CATEGORIES as readonly string[]).includes(input.category)) throw new ApiError(400, "Onbekende categorie.");
  const name = cleanFileName(input.name);
  const { mime } = inspectUpload(name, input.data);

  let versionGroup: string = randomUUID();
  let version = 1;
  let category = input.category;
  if (input.replacesId) {
    need(ctx, "files:update");
    const prev = await prisma.commercialFile.findUnique({ where: { id: input.replacesId } });
    if (!prev || prev.companyId !== companyId || prev.archivedAt) notFound("Bestand");
    const top = await prisma.commercialFile.aggregate({ where: { versionGroup: prev.versionGroup }, _max: { version: true } });
    versionGroup = prev.versionGroup;
    version = (top._max.version ?? prev.version) + 1;
    category = prev.category;
  }

  // Willekeurige sleutel zonder bestandsnaam of bedrijfsnaam; de opslag-URL verlaat de server nooit.
  const storageKey = `commercial/${companyId}/${randomUUID()}`;
  const sha256 = createHash("sha256").update(input.data).digest("hex");
  await getStorage().put({ key: storageKey, data: input.data, contentType: mime });
  try {
    const file = await prisma.commercialFile.create({
      data: { companyId, category, name, mimeType: mime, sizeBytes: input.data.length, sha256, storageKey, versionGroup, version, note: input.note?.trim().slice(0, 500) || null, uploadedById: ctx.userId },
    });
    await auditRecord(ctx, { action: "file.upload", entity: "file", entityId: file.id, after: { companyId, category, version, sizeBytes: file.sizeBytes } });
    return publicFile(file);
  } catch (e) {
    await getStorage().delete(storageKey);
    throw e;
  }
}

async function visibleFile(ctx: RecordCtx, id: string) {
  const file = await prisma.commercialFile.findUnique({ where: { id } });
  if (!file) notFound("Bestand");
  await visibleCompany(ctx, file.companyId);
  return file;
}

export async function archiveFile(ctx: RecordCtx, id: string) {
  need(ctx, "files:archive");
  const file = await visibleFile(ctx, id);
  if (file.archivedAt) return;
  await prisma.commercialFile.update({ where: { id }, data: { archivedAt: new Date() } });
  await auditRecord(ctx, { action: "file.archive", entity: "file", entityId: id, before: { companyId: file.companyId, category: file.category } });
}

export async function readFileForDownload(ctx: RecordCtx, id: string, inline: boolean) {
  need(ctx, "files:download");
  const file = await visibleFile(ctx, id);
  if (file.archivedAt) notFound("Bestand");
  const data = await getStorage().get(file.storageKey);
  await auditRecord(ctx, { action: "file.download", entity: "file", entityId: id, after: { companyId: file.companyId } });
  const asInline = inline && INLINE_MIME.has(file.mimeType);
  return { data, name: file.name, mime: file.mimeType, inline: asInline };
}
