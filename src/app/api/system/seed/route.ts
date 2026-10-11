import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { runSeed } from "@/lib/seed";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Eenmalige bootstrap-endpoint om de (productie)database te seeden zonder
 * dat iemand het databasewachtwoord hoeft te delen: dit draait met de
 * omgevingsvariabelen van de omgeving waarin het wordt aangeroepen (dus
 * met Vercel's eigen DATABASE_URL wanneer daar aangeroepen).
 *
 * Beveiligd met SEED_SECRET — zonder deze env var (of met een verkeerde
 * waarde) doet dit endpoint niets. Idempotent: bestaande gebruikers worden
 * nooit overschreven (zie src/lib/seed.ts), dus veilig om meerdere keren
 * aan te roepen.
 *
 * Alleen POST met het secret in een header (x-seed-secret): een GET met
 * ?secret=... in de query-string werd eerder ook ondersteund voor het
 * gemak, maar een secret in een query-string kan belanden in
 * reverse-proxy-/CDN-logs, browsergeschiedenis en Referer-headers — dat
 * risico is niet nodig voor een endpoint dat alleen bedoeld is om via
 * curl/Postman met een header aangeroepen te worden.
 */
export async function POST(req: Request) {
  const configuredSecret = process.env.SEED_SECRET;
  if (!configuredSecret) {
    return NextResponse.json(
      { error: "SEED_SECRET is niet ingesteld op de server. Voeg deze omgevingsvariabele toe en probeer opnieuw." },
      { status: 503 }
    );
  }

  const provided = req.headers.get("x-seed-secret") ?? "";

  if (!safeEqual(provided, configuredSecret)) {
    return NextResponse.json({ error: "Niet geautoriseerd." }, { status: 401 });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "beheer@hhchardenberg.nl";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "wijzig-dit-wachtwoord";

  try {
    const result = await runSeed(prisma, { adminEmail, adminPassword });
    return NextResponse.json({
      ok: true,
      message: "Database geseed. Log in met het admin-account (zie SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD).",
      adminEmail: result.adminEmail,
    });
  } catch (error) {
    console.error("[seed] mislukt", error);
    return NextResponse.json({ error: "Seeden is mislukt. Bekijk de serverlogs voor details." }, { status: 500 });
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
