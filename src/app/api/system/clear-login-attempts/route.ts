import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * EENMALIGE, TIJDELIJKE beheerroute om de login-rate-limiter handmatig te
 * resetten (zie src/lib/login-rate-limit.ts) — nodig omdat DATABASE_URL
 * bewust write-only is ingesteld (Neon-integratie, "sensitive"-type), dus
 * er is geen andere manier om de LoginAttempt-tabel aan te passen dan via
 * de app zelf. Zelfde beveiligingsmodel als /api/system/seed en
 * /api/system/migrate-baseline (SEED_SECRET-header). Na gebruik weer
 * verwijderen.
 */
export async function POST(req: Request) {
  const configuredSecret = process.env.SEED_SECRET;
  if (!configuredSecret) {
    return NextResponse.json(
      { error: "SEED_SECRET is niet ingesteld op de server." },
      { status: 503 }
    );
  }

  const provided = req.headers.get("x-seed-secret") ?? "";
  if (!safeEqual(provided, configuredSecret)) {
    return NextResponse.json({ error: "Niet geautoriseerd." }, { status: 401 });
  }

  const { count } = await prisma.loginAttempt.deleteMany({});
  return NextResponse.json({ ok: true, deleted: count });
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
