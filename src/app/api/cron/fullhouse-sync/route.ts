import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { runAutoSync } from "@/lib/tickets/fullhouse/auto-sync.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Toegang met FULLHOUSE_SYNC_SECRET (aparte sleutel voor de geplande taak) of CRON_SECRET. */
function authorized(req: Request): boolean {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  return [process.env.FULLHOUSE_SYNC_SECRET, process.env.CRON_SECRET].some((secret) => {
    if (!secret || secret.length < 16) return false;
    const wanted = Buffer.from(`Bearer ${secret}`);
    return given.length === wanted.length && timingSafeEqual(given, wanted);
  });
}

/**
 * Frequente Fullhouse-synchronisatie (alleen lezen), elke 10 minuten aangeroepen door de geplande
 * GitHub-taak (.github/workflows/fullhouse-sync.yml). Vercel Hobby staat cron maar eens per dag toe;
 * daarom komt de klok van buiten. Haalt per wedstrijd alleen wijzigingen op en draait nooit dubbel.
 */
async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Niet toegestaan." }, { status: 401 });
  if (!isTicketsEnabled()) return NextResponse.json({ skipped: "HHC Tickets staat uit." });
  try {
    return NextResponse.json(await runAutoSync({ trigger: "schedule", minIntervalMs: 60_000 }));
  } catch (e) {
    console.error("[fullhouse-sync] ronde mislukt", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Synchronisatie mislukt." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
