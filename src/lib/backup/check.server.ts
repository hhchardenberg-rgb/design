import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { sendBackupCheckEmail } from "@/lib/mail";
import { decryptBackup, parseKey } from "./crypto";
import { parseBackup } from "./db";
import { backupConfig } from "./service.server";
import { getBackupTarget } from "./target.server";
import { evaluateBackupCheck, type BackupCheckReport, type NeonState, type RestoreTest, type RunSummary } from "./check";

/** Het Neon-project van de Hub (neon-cerise-jacket). Te overschrijven met NEON_PROJECT_ID. */
const DEFAULT_NEON_PROJECT = "fancy-frog-00433813";

/** Downloadt de nieuwste geslaagde back-up, ontsleutelt hem en leest alle rijen, precies zoals een herstel dat zou doen. */
async function restoreTest(newest: RunSummary | undefined): Promise<RestoreTest | null> {
  const target = getBackupTarget();
  if (!newest || !newest.storageKey || !target || newest.target !== target.kind) return null;
  try {
    const key = parseKey(process.env.BACKUP_ENCRYPTION_KEY);
    const parsed = parseBackup(decryptBackup(await target.get(newest.storageKey), key));
    let rows = 0;
    for (const list of parsed.rows.values()) rows += list.length;
    return { runId: newest.id, ok: true, rows, tables: parsed.header.tables.length };
  } catch (error) {
    return { runId: newest.id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function neonState(): Promise<NeonState> {
  const apiKey = process.env.NEON_API_KEY;
  if (!apiKey) return { configured: false };
  const project = process.env.NEON_PROJECT_ID || DEFAULT_NEON_PROJECT;
  const get = async (path: string) => {
    const res = await fetch(`https://console.neon.tech/api/v2${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Neon gaf foutcode ${res.status}.`);
    return res.json();
  };
  try {
    const [{ project: p }, { branches }] = await Promise.all([get(`/projects/${project}`), get(`/projects/${project}/branches`)]);
    const main = (branches as { default?: boolean; primary?: boolean; current_state?: string }[]).find((b) => b.default || b.primary);
    return {
      configured: true,
      mainReady: main?.current_state === "ready",
      historyHours: (p?.history_retention_seconds ?? 0) / 3600,
      branchCount: branches.length,
    };
  } catch (error) {
    return { configured: true, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Voert de controle uit en legt de uitkomst vast in de audit-log (daar leest het beheerscherm hem terug). */
export async function runBackupCheck(opts: { actor?: AuditActor | null; notify?: boolean } = {}): Promise<BackupCheckReport> {
  const now = new Date();
  const config = backupConfig();
  const runs: RunSummary[] = await prisma.backupRun.findMany({
    where: { startedAt: { gt: new Date(now.getTime() - 400 * 86_400_000) } },
    orderBy: { startedAt: "desc" },
    select: { id: true, status: true, startedAt: true, keyId: true, storageKey: true, prunedAt: true, target: true, rowCount: true, tableCount: true, filesPending: true },
  });
  const newest = runs.find((r) => r.status === "OK" && !r.prunedAt);
  const [restore, neon] = await Promise.all([restoreTest(newest), neonState()]);
  const report = evaluateBackupCheck({
    now,
    configProblems: config.problems,
    target: config.target,
    mirrorsFiles: config.mirrorsFiles,
    currentKeyId: config.keyId,
    runs,
    restore,
    neon,
  });

  const problems = report.items.filter((i) => i.status === "warn" || i.status === "fail");
  await audit({
    action: "backup.check",
    actor: opts.actor ?? null,
    target: { type: "backup" },
    summary:
      report.status === "ok"
        ? "Back-upcontrole: alles in orde"
        : `Back-upcontrole: ${problems.map((p) => p.label.toLowerCase()).join(", ")}`,
    meta: { report },
  });

  if (opts.notify) await notifyAdmins(report);
  return report;
}

async function notifyAdmins(report: BackupCheckReport) {
  if (process.env.VERCEL_ENV !== "production") return; // een preview mailt nooit echte gebruikers
  const admins = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } }, select: { email: true, name: true } });
  for (const a of admins) {
    await sendBackupCheckEmail(a.email, a.name, report).catch((e) => console.error("[backup-check] mail mislukt", e));
  }
}
