import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { syncUpcoming } from "@/lib/tickets/fullhouse/sync.server";
import { runTicketRetention } from "@/lib/tickets/retention.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** Dagelijks: Fullhouse-synchronisatie (alleen lezen) en bewaartermijnen. Doet niets als HHC Tickets uit staat. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Niet toegestaan." }, { status: 401 });
  if (!isTicketsEnabled()) return NextResponse.json({ skipped: "HHC Tickets staat uit." });
  const out: Record<string, unknown> = {};
  try {
    out.sync = await syncUpcoming();
  } catch {
    out.sync = { error: "Synchronisatie mislukt." };
  }
  try {
    out.retention = await runTicketRetention();
  } catch {
    out.retention = { error: "Opruimen mislukt." };
  }
  return NextResponse.json(out);
}
