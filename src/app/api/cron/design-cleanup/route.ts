import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runDesignCleanup } from "@/lib/design/cleanup.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // zonder geheim is de route dicht
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** Wekelijks opruimen van ongebruikte uploads en oude batch-ZIP's (Vercel Cron). */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Niet toegestaan." }, { status: 401 });
  return NextResponse.json(await runDesignCleanup());
}
