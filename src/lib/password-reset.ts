import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { normalizeEmail } from "@/lib/utils";
import { sendPasswordResetEmail } from "@/lib/mail";

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 uur geldig

// Twee onafhankelijke drempels, zelfde opzet als login-rate-limit.ts: per
// e-mailadres (stopt het volspammen van één account) en per IP (stopt één
// afzender die voor veel verschillende accounts tegelijk mailtjes aanvraagt).
const EMAIL_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_MAX_REQUESTS = 3;
const IP_WINDOW_MS = 60 * 60 * 1000;
const IP_MAX_REQUESTS = 10;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Vraagt een reset aan. Geeft bewust nooit terug of het e-mailadres
 * bestaat — de aanroepende route stuurt altijd dezelfde generieke melding
 * terug, ongeacht wat hier gebeurt (zie /api/auth/forgot-password). Als het
 * account niet bestaat of de aanvrager over de limiet zit, gebeurt er
 * stilletjes niets.
 */
export async function requestPasswordReset(prisma: PrismaClient, email: string, ip: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const now = Date.now();

  // IP-check geldt sowieso, ook voor een niet-bestaand account — zodat het
  // uitblijven ervan niet verraadt of een e-mailadres wél bestaat.
  const ipCount = await prisma.passwordResetToken.count({
    where: { ip, createdAt: { gte: new Date(now - IP_WINDOW_MS) } },
  });
  if (ipCount >= IP_MAX_REQUESTS) return;

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) return;

  const emailCount = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gte: new Date(now - EMAIL_WINDOW_MS) } },
  });
  if (emailCount >= EMAIL_MAX_REQUESTS) return;

  const token = await createPasswordToken(prisma, user.id, ip, TOKEN_TTL_MS);
  await sendPasswordResetEmail(user.email, user.name, token);
}

/**
 * Maakt een eenmalig token waarmee iemand zelf een wachtwoord kiest via /wachtwoord-resetten/[token]. Ook gebruikt
 * voor de instellink in de welkomstmail (zie src/lib/welcome.server.ts), met een langere geldigheid.
 */
export async function createPasswordToken(prisma: PrismaClient, userId: string, ip: string, ttlMs: number): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash: hashToken(token), ip, expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

/**
 * Verzilvert een token en zet het wachtwoord. Atomair "claimen" van het
 * token via updateMany + count i.p.v. find-then-update, zodat twee
 * gelijktijdige aanvragen met hetzelfde token niet allebei kunnen slagen
 * (zelfde patroon als consumeChallenge() in src/lib/webauthn/challenge-store.ts).
 */
export async function consumePasswordResetToken(
  prisma: PrismaClient,
  token: string,
  newPassword: string
): Promise<boolean> {
  const tokenHash = hashToken(token);
  const now = new Date();

  const claimed = await prisma.passwordResetToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count === 0) return false;

  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record) return false;

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: record.userId }, data: { passwordHash } });
  return true;
}
