import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runBackupCheck } from "@/lib/backup/check.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // zonder geheim is de route dicht
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * Wekelijkse back-upcontrole (maandagochtend), aangeroepen door Vercel Cron met
 * Authorization: Bearer $CRON_SECRET. Opent de nieuwste back-up op proef, kijkt of er elke nacht
 * een is gemaakt en of Neon zijn herstelpunten heeft, en mailt de uitkomst naar de hoofdadmins.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Niet toegestaan." }, { status: 401 });
  try {
    const report = await runBackupCheck({ notify: true });
    return NextResponse.json({ status: report.status, items: report.items.map((i) => ({ key: i.key, status: i.status })) });
  } catch (error) {
    console.error("[backup-check] mislukt", error);
    return NextResponse.json({ error: "Controle mislukt." }, { status: 500 });
  }
}
