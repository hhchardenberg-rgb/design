import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { BackupNotConfigured, runBackup } from "@/lib/backup/service.server";

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

/** Dagelijkse back-up; aangeroepen door Vercel Cron met Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Niet toegestaan." }, { status: 401 });
  try {
    const run = await runBackup({ trigger: "SCHEDULED", fileBudgetMs: 200_000, notifyOnFailure: true });
    return NextResponse.json({ ok: true, id: run.id, bytes: run.bytes, rows: run.rowCount, filesCopied: run.filesCopied, filesPending: run.filesPending });
  } catch (error) {
    if (error instanceof BackupNotConfigured) return NextResponse.json({ skipped: error.message });
    return NextResponse.json({ error: "Back-up mislukt." }, { status: 500 });
  }
}
