import type { PrismaClient } from "@prisma/client";

// Hoelang een gegenereerde challenge geldig blijft — ruim genoeg om de
// WebAuthn-ceremonie (vingerafdruk/Face ID/sleutel aanraken) af te maken,
// kort genoeg om een oude, nooit-gebruikte challenge niet lang te laten
// rondslingeren.
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type ChallengePurpose = "registration" | "authentication";

export async function storeChallenge(
  prisma: PrismaClient,
  challenge: string,
  purpose: ChallengePurpose,
  userId: string | null
): Promise<void> {
  await prisma.webAuthnChallenge.create({ data: { challenge, purpose, userId } });

  // Opportunistische opruiming van verlopen, nooit-afgemaakte pogingen —
  // zelfde aanpak als LoginAttempt, geen aparte cronjob nodig.
  if (Math.random() < 0.05) {
    await prisma.webAuthnChallenge.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - CHALLENGE_TTL_MS) } },
    });
  }
}

/**
 * Haalt een challenge op en verwijdert 'm meteen (single-use, ongeacht of
 * de daaropvolgende handtekeningverificatie slaagt) — voorkomt replay van
 * dezelfde challenge. Geeft `null` als de challenge niet bestaat, van het
 * verkeerde type is, bij een andere gebruiker hoort, of verlopen is.
 */
export async function consumeChallenge(
  prisma: PrismaClient,
  challenge: string,
  purpose: ChallengePurpose,
  userId: string | null
): Promise<boolean> {
  const row = await prisma.webAuthnChallenge.findUnique({ where: { challenge } });
  if (!row) return false;

  // Atomisch verwijderen (DELETE ... WHERE id = ...) i.p.v. eerst ophalen
  // en dan los verwijderen: bij twee gelijktijdige verificatiepogingen met
  // dezelfde challenge claimt maar één van de twee 'm daadwerkelijk
  // (count === 1) — voorkomt een race condition waarbij beide de challenge
  // nog geldig zouden vinden.
  const deleted = await prisma.webAuthnChallenge.deleteMany({ where: { id: row.id } });
  if (deleted.count !== 1) return false;

  if (row.purpose !== purpose) return false;
  if (userId !== null && row.userId !== userId) return false;
  if (Date.now() - row.createdAt.getTime() > CHALLENGE_TTL_MS) return false;

  return true;
}
