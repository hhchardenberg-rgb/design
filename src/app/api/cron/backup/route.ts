import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { BackupNotConfigured, runBackup } from "@/lib/backup/service.server";
import { pruneAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { encryptExistingFields } from "@/lib/data-crypto-migrate.server";
import { encryptExistingFiles } from "@/lib/commercial/files.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // zonder geheim is de route dicht
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * Nachtelijk onderhoud; aangeroepen door Vercel Cron met Authorization: Bearer $CRON_SECRET.
 * Eerst de back-up (zodat er altijd een kopie is van vóór de rest), dan versleutelen van nog
 * onversleutelde gegevens en opruimen van oude logregels.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Niet toegestaan." }, { status: 401 });
  const started = Date.now();
  const result: Record<string, unknown> = {};
  try {
    const run = await runBackup({ trigger: "SCHEDULED", fileBudgetMs: 150_000, notifyOnFailure: true });
    result.backup = { id: run.id, bytes: run.bytes, rows: run.rowCount, filesCopied: run.filesCopied, filesPending: run.filesPending };
  } catch (error) {
    result.backup = error instanceof BackupNotConfigured ? { skipped: error.message } : { error: "Back-up mislukt." };
  }
  try {
    result.encryptedFields = await encryptExistingFields();
    result.encryptedFiles = await encryptExistingFiles(started + 270_000);
    result.auditPruned = await pruneAudit();
    result.devicesPruned = (await prisma.knownDevice.deleteMany({ where: { lastSeenAt: { lt: new Date(Date.now() - 400 * 86_400_000) } } })).count;
  } catch (error) {
    console.error("[cron] onderhoud mislukt", error);
    result.maintenance = "mislukt";
  }
  const failed = (result.backup as { error?: string }).error || result.maintenance;
  return NextResponse.json(result, { status: failed ? 500 : 200 });
}
