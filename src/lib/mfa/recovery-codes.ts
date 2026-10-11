import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

const CODE_COUNT = 10;
// 10 tekens uit een leesbare set zonder verwarrende tekens (0/O, 1/I/l) —
// nog steeds >51 bits entropie per code, ruim genoeg voor een eenmalige
// herstelcode die bovendien gehasht wordt opgeslagen.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateOneCode(): string {
  const bytes = randomBytes(10);
  let code = "";
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length];
  }
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** Genereert een nieuwe set herstelcodes, slaat ze gehasht op en geeft de PLATTE versie één keer terug (om te tonen/downloaden). */
export async function generateRecoveryCodes(prisma: PrismaClient, userId: string): Promise<string[]> {
  const codes = Array.from({ length: CODE_COUNT }, generateOneCode);
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({
      data: await Promise.all(
        codes.map(async (code) => ({ userId, codeHash: await bcrypt.hash(code, 12) }))
      ),
    }),
  ]);
  return codes;
}

/**
 * Verifieert en verbruikt (markeert als gebruikt) één herstelcode. Elke
 * code werkt maar één keer. Haalt alle niet-gebruikte codes van de
 * gebruiker op en vergelijkt met bcrypt (niet te vermijden: codeHash is
 * geen directe lookup-sleutel), maar dat zijn er hooguit 10 per gebruiker.
 */
export async function consumeRecoveryCode(prisma: PrismaClient, userId: string, rawCode: string): Promise<boolean> {
  const candidates = await prisma.recoveryCode.findMany({ where: { userId, usedAt: null } });
  for (const candidate of candidates) {
    if (await bcrypt.compare(rawCode, candidate.codeHash)) {
      // Dubbel-gebruik binnen een race condition voorkomen: alleen slagen
      // als de rij nog steeds `usedAt: null` was op het moment van update.
      const result = await prisma.recoveryCode.updateMany({
        where: { id: candidate.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (result.count === 1) return true;
    }
  }
  return false;
}

/** Puur voor UI: hoeveel ongebruikte herstelcodes een gebruiker nog over heeft. */
export async function countRemainingRecoveryCodes(prisma: PrismaClient, userId: string): Promise<number> {
  return prisma.recoveryCode.count({ where: { userId, usedAt: null } });
}
