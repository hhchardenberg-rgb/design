import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendCommercialDigestEmail } from "@/lib/mail";
import { runReminders } from "@/lib/commercial/reminders.server";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // zonder geheim is de route dicht
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** Dagelijkse herinneringen; aangeroepen door Vercel Cron met Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Niet toegestaan." }, { status: 401 });
  if (process.env.COMMERCIAL_ENABLED !== "true") return NextResponse.json({ skipped: "Commerciële Zaken staat uit." });
  const result = await runReminders(new Date(), (d) => sendCommercialDigestEmail(d.email, d.name, d));
  return NextResponse.json(result);
}
