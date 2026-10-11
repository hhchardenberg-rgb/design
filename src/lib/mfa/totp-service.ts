import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api-guards";
import { encryptSecret, decryptSecret } from "./crypto";
import { generateTotpSecret, totpQrCodeDataUrl, verifyTotpCode } from "./totp";
import { generateRecoveryCodes, consumeRecoveryCode } from "./recovery-codes";

export interface TotpEnrollmentStart {
  secret: string;
  qrCodeDataUrl: string;
}

/**
 * Stap 1-3 van het registratieproces: genereert een nieuw geheim en toont
 * de QR-code. Overschrijft een eventuele eerdere, nog niet geverifieerde
 * poging (zodat opnieuw scannen na een afgebroken setup gewoon werkt),
 * maar raakt nooit een al geactiveerde (`verifiedAt` gezet) koppeling —
 * die moet de gebruiker eerst expliciet uitschakelen (vereist
 * her-authenticatie, zie account-security-route).
 */
export async function startTotpEnrollment(
  prisma: PrismaClient,
  userId: string,
  accountEmail: string
): Promise<TotpEnrollmentStart> {
  const existing = await prisma.totpCredential.findUnique({ where: { userId } });
  if (existing?.verifiedAt) {
    throw new ApiError(409, "Tweestapsverificatie is al actief — schakel deze eerst uit voordat je opnieuw instelt.");
  }

  const secret = generateTotpSecret();
  await prisma.totpCredential.upsert({
    where: { userId },
    create: { userId, encryptedSecret: encryptSecret(secret) },
    update: { encryptedSecret: encryptSecret(secret), verifiedAt: null, lastUsedStep: null },
  });

  return { secret, qrCodeDataUrl: await totpQrCodeDataUrl(secret, accountEmail) };
}

/**
 * Stap 4-8: de gebruiker voert de actuele code in. Pas na deze succesvolle
 * verificatie wordt TOTP echt actief (`verifiedAt` gezet) en worden
 * herstelcodes aangemaakt.
 */
export async function confirmTotpEnrollment(
  prisma: PrismaClient,
  userId: string,
  code: string
): Promise<{ recoveryCodes: string[] }> {
  const credential = await prisma.totpCredential.findUnique({ where: { userId } });
  if (!credential || credential.verifiedAt) {
    throw new ApiError(409, "Geen openstaande tweestapsverificatie-registratie gevonden.");
  }

  const secret = decryptSecret(credential.encryptedSecret);
  const result = await verifyTotpCode(secret, code);
  if (!result.valid) {
    throw new ApiError(400, "Ongeldige code. Controleer of de tijd op je apparaat goed staat en probeer opnieuw.");
  }

  await prisma.totpCredential.update({
    where: { userId },
    data: { verifiedAt: new Date(), lastUsedStep: BigInt(result.timeStep!) },
  });

  const recoveryCodes = await generateRecoveryCodes(prisma, userId);
  return { recoveryCodes };
}

/**
 * Verifieert een code tijdens het inloggen tegen een AL geactiveerde
 * TOTP-koppeling. `afterTimeStep` geeft otplib's eigen, ingebouwde
 * replay-bescherming de laatst geaccepteerde stap mee, zodat exact
 * dezelfde code niet twee keer achter elkaar gebruikt kan worden.
 */
export async function verifyTotpLogin(prisma: PrismaClient, userId: string, code: string): Promise<boolean> {
  const credential = await prisma.totpCredential.findUnique({ where: { userId } });
  if (!credential?.verifiedAt) return false;

  const secret = decryptSecret(credential.encryptedSecret);
  const afterTimeStep = credential.lastUsedStep !== null ? Number(credential.lastUsedStep) : undefined;
  const result = await verifyTotpCode(secret, code, afterTimeStep);
  if (!result.valid) return false;

  await prisma.totpCredential.update({ where: { userId }, data: { lastUsedStep: BigInt(result.timeStep!) } });
  return true;
}

/** Herstelcode als alternatief voor de TOTP-code tijdens het inloggen. */
export async function verifyRecoveryCodeLogin(prisma: PrismaClient, userId: string, code: string): Promise<boolean> {
  return consumeRecoveryCode(prisma, userId, code.trim());
}

export async function hasTotpEnabled(prisma: PrismaClient, userId: string): Promise<boolean> {
  const credential = await prisma.totpCredential.findUnique({ where: { userId }, select: { verifiedAt: true } });
  return Boolean(credential?.verifiedAt);
}

/** Schakelt TOTP volledig uit — ook de herstelcodes, die horen bij déze koppeling. */
export async function disableTotp(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.totpCredential.deleteMany({ where: { userId } }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
  ]);
}
