import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { execFileSync } from "child_process";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * EENMALIGE, TIJDELIJKE bootstrap-endpoint voor de overstap van
 * `prisma db push` naar `prisma migrate deploy`.
 *
 * De productiedatabase bevat alle bestaande tabellen al (aangemaakt via
 * `db push`, niet via een bijgehouden migratie). `prisma migrate deploy`
 * houdt zelf bij welke migraties al zijn toegepast (in de tabel
 * `_prisma_migrations`) — zonder deze stap zou de EERSTE `migrate deploy`
 * de baseline-migratie (prisma/migrations/..._baseline, die letterlijk
 * "maak alle tabellen" bevat) proberen uit te voeren tegen een database
 * waar die tabellen al bestaan, en falen.
 *
 * Deze route markeert de baseline-migratie als "al toegepast" (zonder de
 * SQL ervan daadwerkelijk uit te voeren) — exact wat
 * `prisma migrate resolve --applied <naam>` doet, hier via de Prisma CLI
 * zelf aangeroepen (niet via een losse SQL-insert) zodat Prisma's eigen,
 * correcte checksumlogica gebruikt wordt. Na een succesvolle aanroep kan
 * de build-pipeline veilig overstappen op `prisma migrate deploy`, en moet
 * dit bestand weer verwijderd worden — zie het beveiligingsrapport.
 *
 * Zelfde beveiligingsmodel als /api/system/seed (SEED_SECRET-header) —
 * geen apart secret erbij, dit is dezelfde "vertrouwde operator voert een
 * eenmalige bootstrap-actie uit"-situatie.
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

  try {
    const output = execFileSync(
      "npx",
      ["prisma", "migrate", "resolve", "--applied", "20261011143922_baseline"],
      { encoding: "utf8", stdio: "pipe" }
    );
    return NextResponse.json({ ok: true, output });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[migrate-baseline] mislukt", error);
    return NextResponse.json({ error: "Baseline-resolve mislukt.", detail: message }, { status: 500 });
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
