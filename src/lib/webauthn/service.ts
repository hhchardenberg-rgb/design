import type { PrismaClient } from "@prisma/client";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { ApiError } from "@/lib/api-guards";
import { RP_NAME, RP_ID, RP_ORIGIN } from "./rp";
import { storeChallenge, consumeChallenge } from "./challenge-store";

// ---------------------------------------------------------------------------
// Registratie (een passkey toevoegen aan een AL ingelogd account)
// ---------------------------------------------------------------------------

export async function startPasskeyRegistration(prisma: PrismaClient, userId: string, email: string) {
  const existing = await prisma.webAuthnCredential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(userId),
    userName: email,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });

  await storeChallenge(prisma, options.challenge, "registration", userId);
  return options;
}

export async function finishPasskeyRegistration(
  prisma: PrismaClient,
  userId: string,
  response: RegistrationResponseJSON,
  name: string
): Promise<void> {
  const challenge = decodeClientDataChallenge(response);
  const challengeValid = await consumeChallenge(prisma, challenge, "registration", userId);
  if (!challengeValid) throw new ApiError(400, "Registratie verlopen of al gebruikt — probeer opnieuw.");

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
    });
  } catch {
    throw new ApiError(400, "Registratie kon niet worden geverifieerd.");
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new ApiError(400, "Registratie kon niet worden geverifieerd.");
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const trimmedName = name.trim() || "Onbenoemd apparaat";

  await prisma.webAuthnCredential.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: trimmedName,
    },
  });
}

/**
 * Haalt de challenge rechtstreeks uit clientDataJSON — nodig om 'm op te
 * zoeken in onze eigen challenge-store (zie challenge-store.ts) vóórdat
 * verifyRegistrationResponse()/verifyAuthenticationResponse() aangeroepen
 * wordt; die functies controleren zelf ook dat deze waarde overeenkomt met
 * wat is meegegeven als `expectedChallenge`, dus dit dupliceert geen
 * beveiligingscheck — het ontsluit alleen de waarde die we al vooraf nodig
 * hebben.
 */
function decodeClientDataChallenge(response: RegistrationResponseJSON | AuthenticationResponseJSON): string {
  const clientDataJSON = JSON.parse(
    Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8")
  ) as { challenge: string };
  return clientDataJSON.challenge;
}

// ---------------------------------------------------------------------------
// Inloggen met passkey als tweede factor (ná een correct wachtwoord)
// ---------------------------------------------------------------------------

export async function startPasskeyLoginOptions(prisma: PrismaClient, userId: string) {
  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });
  if (credentials.length === 0) return null;

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: credentials.map((c) => ({ id: c.credentialId, transports: c.transports })),
    // Discouraged: het wachtwoord heeft de gebruiker al geverifieerd; dit
    // is hier puur de TWEEDE factor, niet de enige. Zie
    // startPasswordlessLoginOptions hieronder voor het wachtwoordloze pad,
    // waar user verification wél vereist is.
    userVerification: "discouraged",
  });

  await storeChallenge(prisma, options.challenge, "authentication", userId);
  return options;
}

/** Verifieert een passkey-antwoord tegen een specifieke, al bekende gebruiker (2FA-pad). */
export async function verifyPasskeyLogin(
  prisma: PrismaClient,
  userId: string,
  response: AuthenticationResponseJSON
): Promise<boolean> {
  const challenge = decodeClientDataChallenge(response);
  const challengeValid = await consumeChallenge(prisma, challenge, "authentication", userId);
  if (!challengeValid) return false;

  const stored = await prisma.webAuthnCredential.findUnique({ where: { credentialId: response.id } });
  if (!stored || stored.userId !== userId) return false;

  return verifyAndUpdateCounter(prisma, stored, response, challenge);
}

// ---------------------------------------------------------------------------
// Wachtwoordloos inloggen (discoverable credential — geen e-mail vooraf)
// ---------------------------------------------------------------------------

export async function startPasswordlessLoginOptions(prisma: PrismaClient) {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    // Geen allowCredentials: de browser laat de gebruiker zelf kiezen uit
    // alle passkeys die hij voor deze site heeft (discoverable credentials).
    userVerification: "required",
  });

  await storeChallenge(prisma, options.challenge, "authentication", null);
  return options;
}

/**
 * Verifieert een wachtwoordloos passkey-antwoord. De gebruiker is nog niet
 * bekend — die volgt uit `response.response.userHandle` (ingesteld tijdens
 * registratie op de gebruikers-id, zie startPasskeyRegistration hierboven).
 * Geeft de userId terug bij succes, anders `null`.
 */
export async function verifyPasswordlessLogin(
  prisma: PrismaClient,
  response: AuthenticationResponseJSON
): Promise<string | null> {
  const challenge = decodeClientDataChallenge(response);
  const challengeValid = await consumeChallenge(prisma, challenge, "authentication", null);
  if (!challengeValid) return null;

  const stored = await prisma.webAuthnCredential.findUnique({ where: { credentialId: response.id } });
  if (!stored) return null;

  const userHandle = response.response.userHandle;
  if (!userHandle) return null;
  const claimedUserId = Buffer.from(userHandle, "base64url").toString("utf8");
  if (claimedUserId !== stored.userId) return null;

  const ok = await verifyAndUpdateCounter(prisma, stored, response, challenge);
  return ok ? stored.userId : null;
}

// ---------------------------------------------------------------------------
// Gedeeld: handtekening verifiëren + counter bijwerken
// ---------------------------------------------------------------------------

interface StoredCredential {
  id: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
}

async function verifyAndUpdateCounter(
  prisma: PrismaClient,
  stored: StoredCredential,
  response: AuthenticationResponseJSON,
  expectedChallenge: string
): Promise<boolean> {
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports as AuthenticatorTransport[],
      },
    });
  } catch {
    return false;
  }
  if (!verification.verified) return false;

  // Veel gesynchroniseerde passkeys (iCloud Keychain, Google Password
  // Manager) rapporteren de counter altijd als 0 — @simplewebauthn's eigen
  // verificatie staat dat al toe (geen "counter ging niet omhoog"-fout bij
  // 0 -> 0); hier alleen de nieuwe waarde opslaan, geen extra eigen check
  // nodig die dat zou kunnen verstoren.
  await prisma.webAuthnCredential.update({
    where: { id: stored.id },
    data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
  });

  return true;
}
