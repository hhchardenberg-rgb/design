import { Prisma } from "@prisma/client";
import { list as listBlobs } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { formatDayTime } from "@/lib/date-format";
import { sendBackupFailedEmail } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { encryptBackup, ENCRYPTION_OVERHEAD, fingerprintHex, parseKey } from "./crypto";
import { dumpDatabase, type Sql } from "./db";
import { selectExpired } from "./retention";
import { backupTargetKind, getBackupTarget, type BackupTarget } from "./target.server";

/** Mappen in de bestandsopslag die niet gekopieerd worden: ze zijn opnieuw te maken (exports, ZIP's) of zijn zelf back-ups. */
export const SKIPPED_FILE_PREFIXES = ["exports/", "batches/", "backups/"];
/** Een back-up die langer dan dit "bezig" is, is vastgelopen en blokkeert een nieuwe niet meer. */
const STALE_RUN_MS = 15 * 60 * 1000;
/** Na zoveel uur zonder geslaagde back-up toont het beheerscherm een waarschuwing. */
export const STALE_AFTER_HOURS = 36;

export interface BackupConfig {
  target: "s3" | "blob" | null;
  targetLabel: string | null;
  encryption: boolean;
  keyId: string | null;
  mirrorsFiles: boolean;
  problems: string[];
}

export function backupConfig(): BackupConfig {
  const problems: string[] = [];
  let keyId: string | null = null;
  try {
    keyId = fingerprintHex(parseKey(process.env.BACKUP_ENCRYPTION_KEY));
  } catch (e) {
    problems.push(e instanceof Error ? e.message : String(e));
  }
  const target = getBackupTarget();
  if (!target) problems.push("Er is geen back-upopslag ingesteld (BACKUP_S3_BUCKET of Vercel Blob).");
  if (target?.kind === "s3" && (!process.env.BACKUP_S3_ACCESS_KEY_ID || !process.env.BACKUP_S3_SECRET_ACCESS_KEY)) {
    problems.push("BACKUP_S3_ACCESS_KEY_ID en BACKUP_S3_SECRET_ACCESS_KEY zijn nodig voor de S3-opslag.");
  }
  return {
    target: backupTargetKind(),
    targetLabel: target?.label ?? null,
    encryption: !!keyId,
    keyId,
    mirrorsFiles: !!target?.mirrorsFiles && process.env.STORAGE_DRIVER === "vercel-blob",
    problems,
  };
}

function prismaSql(client: Prisma.TransactionClient | typeof prisma): Sql {
  return {
    query: (sql, ...params) => client.$queryRawUnsafe(sql, ...params),
    execute: (sql, ...params) => client.$executeRawUnsafe(sql, ...params),
  };
}

function storageKeyFor(now: Date): string {
  const iso = now.toISOString().replace(/[:.]/g, "-");
  return `db/${iso.slice(0, 4)}/${iso.slice(5, 7)}/hhc-hub-${iso}.hhcbak`;
}

export function downloadName(run: { startedAt: Date }): string {
  return `hhc-hub-backup-${run.startedAt.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.hhcbak`;
}

export interface RunOptions {
  trigger: "SCHEDULED" | "MANUAL";
  user?: { id: string; name?: string | null; email?: string | null } | null;
  /** Tijd (ms) die na de databaseback-up nog gebruikt mag worden voor het kopiëren van bestanden. */
  fileBudgetMs?: number;
  notifyOnFailure?: boolean;
}

/** Maakt een volledige, versleutelde databaseback-up, ruimt verlopen back-ups op en kopieert nieuwe bestanden. */
export async function runBackup(opts: RunOptions) {
  const config = backupConfig();
  if (config.problems.length) throw new BackupNotConfigured(config.problems);
  const target = getBackupTarget()!;
  const key = parseKey(process.env.BACKUP_ENCRYPTION_KEY);

  const busy = await prisma.backupRun.findFirst({ where: { status: "RUNNING", startedAt: { gt: new Date(Date.now() - STALE_RUN_MS) } } });
  if (busy) throw new BackupBusy();

  const run = await prisma.backupRun.create({
    data: {
      trigger: opts.trigger,
      triggeredById: opts.user?.id ?? null,
      triggeredByName: opts.user ? opts.user.name || opts.user.email || null : null,
      target: target.kind,
      keyId: config.keyId,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
  });

  try {
    // Eén samenhangend moment: alle tabellen worden gelezen binnen dezelfde momentopname.
    const { data, header } = await prisma.$transaction(
      (tx) => dumpDatabase(prismaSql(tx), { commit: run.commit, environment: process.env.VERCEL_ENV ?? null, now: run.startedAt }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120_000, maxWait: 10_000 },
    );
    const encrypted = encryptBackup(data, key);
    const stored = await target.put(storageKeyFor(run.startedAt), encrypted);
    await prisma.backupRun.update({
      where: { id: run.id },
      data: {
        storageKey: stored.key,
        bytes: encrypted.length,
        tableCount: header.tables.length,
        rowCount: header.tables.reduce((n, t) => n + t.rows, 0),
      },
    });

    await pruneBackups(target).catch((e) => console.error("[backup] opruimen mislukt", e));

    let files: { copied: number; pending: number } | null = null;
    if (config.mirrorsFiles) {
      files = await mirrorFiles(target, key, Date.now() + (opts.fileBudgetMs ?? 60_000)).catch((e) => {
        console.error("[backup] bestanden kopiëren mislukt", e);
        return null;
      });
    }

    return await prisma.backupRun.update({
      where: { id: run.id },
      data: { status: "OK", finishedAt: new Date(), filesCopied: files?.copied ?? null, filesPending: files?.pending ?? null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[backup] mislukt", error);
    await prisma.backupRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: message.slice(0, 2000) } });
    await audit({ action: "backup.failed", actor: opts.user ?? null, target: { type: "backup", id: run.id }, summary: `Back-up mislukt: ${message.slice(0, 300)}` });
    if (opts.notifyOnFailure) await notifyAdmins(run.startedAt, message);
    throw error;
  }
}

export class BackupNotConfigured extends Error {
  constructor(public problems: string[]) {
    super(`Back-ups zijn nog niet ingesteld: ${problems.join(" ")}`);
  }
}

export class BackupBusy extends Error {
  constructor() {
    super("Er loopt al een back-up. Probeer het over een paar minuten opnieuw.");
  }
}

/** Verwijdert databaseback-ups die buiten de bewaartermijn vallen (zie retention.ts). */
export async function pruneBackups(target: BackupTarget, now = new Date()) {
  const runs = await prisma.backupRun.findMany({
    where: { status: "OK", prunedAt: null, storageKey: { not: null }, target: target.kind },
    select: { id: true, startedAt: true, storageKey: true },
  });
  const expired = new Set(selectExpired(runs.map((r) => ({ id: r.id, createdAt: r.startedAt })), now));
  for (const r of runs) {
    if (!expired.has(r.id)) continue;
    await target.delete(r.storageKey!);
    await prisma.backupRun.update({ where: { id: r.id }, data: { prunedAt: now } });
  }
  return expired.size;
}

/**
 * Kopieert nieuwe en gewijzigde bestanden uit Vercel Blob naar de back-upopslag (versleuteld,
 * onder files/<zelfde pad>). Verwijderde bestanden blijven in de back-up staan, zodat een per
 * ongeluk verwijderd bestand terug te halen is. Stopt bij de deadline; de volgende ronde gaat verder.
 */
export async function mirrorFiles(target: BackupTarget, key: Buffer, deadline: number) {
  const storeOpts = process.env.BLOB_STORE_ID ? { storeId: process.env.BLOB_STORE_ID } : {};
  const existing = new Map((await target.list("files/")).map((o) => [o.key, o]));
  const todo: { pathname: string; url: string }[] = [];
  let cursor: string | undefined;
  do {
    const res = await listBlobs({ cursor, limit: 1000, ...storeOpts });
    for (const b of res.blobs) {
      if (SKIPPED_FILE_PREFIXES.some((p) => b.pathname.startsWith(p))) continue;
      const copy = existing.get(`files/${b.pathname}`);
      const current = copy && copy.size === b.size + ENCRYPTION_OVERHEAD && copy.lastModified >= new Date(b.uploadedAt);
      if (!current) todo.push({ pathname: b.pathname, url: b.url });
    }
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor);

  let copied = 0;
  for (const f of todo) {
    if (Date.now() > deadline) break;
    const res = await fetch(f.url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[backup] bestand ${f.pathname} niet op te halen (${res.status})`);
      continue;
    }
    await target.put(`files/${f.pathname}`, encryptBackup(Buffer.from(await res.arrayBuffer()), key));
    copied++;
  }
  return { copied, pending: todo.length - copied };
}

async function notifyAdmins(when: Date, message: string) {
  if (process.env.VERCEL_ENV !== "production") return; // een preview mailt nooit echte gebruikers
  const admins = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } }, select: { email: true, name: true } });
  for (const a of admins) {
    await sendBackupFailedEmail(a.email, a.name, { when: formatDayTime(when), error: message.slice(0, 500) }).catch((e) =>
      console.error("[backup] waarschuwingsmail mislukt", e),
    );
  }
}

/** Overzicht voor het beheerscherm. */
export async function backupOverview() {
  const config = backupConfig();
  const [runs, lastOk] = await Promise.all([
    prisma.backupRun.findMany({ orderBy: { startedAt: "desc" }, take: 60 }),
    prisma.backupRun.findFirst({ where: { status: "OK" }, orderBy: { startedAt: "desc" } }),
  ]);
  const hoursSinceOk = lastOk ? (Date.now() - lastOk.startedAt.getTime()) / 3_600_000 : null;
  return {
    config,
    lastOkAt: lastOk?.startedAt ?? null,
    stale: hoursSinceOk === null || hoursSinceOk > STALE_AFTER_HOURS,
    runs: runs.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      triggeredByName: r.triggeredByName,
      target: r.target,
      bytes: r.bytes,
      tableCount: r.tableCount,
      rowCount: r.rowCount,
      keyId: r.keyId,
      filesCopied: r.filesCopied,
      filesPending: r.filesPending,
      error: r.error,
      downloadable: r.status === "OK" && !r.prunedAt && !!r.storageKey && r.target === config.target,
      pruned: !!r.prunedAt,
    })),
  };
}

export async function backupDownloadUrl(id: string) {
  const run = await prisma.backupRun.findUnique({ where: { id } });
  const target = getBackupTarget();
  if (!run || run.status !== "OK" || run.prunedAt || !run.storageKey || !target || run.target !== target.kind) return null;
  return target.downloadUrl(run.storageKey, downloadName(run));
}
