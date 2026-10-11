import { generateSecret, generateURI, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";
import { verify } from "@otplib/totp";
import QRCode from "qrcode";

// TOTP-specifieke verify() (i.p.v. otplib's top-level verify(), die ook
// HOTP ondersteunt) geeft een correct getypeerd resultaat terug mét
// `timeStep` — nodig voor de replay-bescherming hieronder. Vereist hier
// wél expliciete crypto-/base32-plugins (de top-level functie kiest die
// zelf; @otplib/totp's eigen verify() niet).
const crypto = new NobleCryptoPlugin();
const base32 = new ScureBase32Plugin();

// RFC 6238-standaardwaarden (30s stappen, 6 cijfers, SHA1) — het
// universele compatibiliteitsformaat dat elke Authenticator-app
// ondersteunt. `epochTolerance: 30` staat precies één tijdstap (±30s)
// kloktolerantie toe in beide richtingen.
const EPOCH_TOLERANCE = 30;

const ISSUER = "HHC Hardenberg Hub";

/** Genereert een nieuw, cryptografisch willekeurig TOTP-geheim (base32). */
export function generateTotpSecret(): string {
  return generateSecret();
}

/** otpauth://-URI voor de QR-code die een Authenticator-app scant. */
export function totpKeyUri(secret: string, accountName: string): string {
  return generateURI({ issuer: ISSUER, label: accountName, secret });
}

export async function totpQrCodeDataUrl(secret: string, accountName: string): Promise<string> {
  return QRCode.toDataURL(totpKeyUri(secret, accountName));
}

export interface TotpVerifyResult {
  valid: boolean;
  /** Het tijdstapnummer waarop de code geaccepteerd is — alleen gezet bij valid:true. Doorgeven als `afterTimeStep` bij de volgende verificatie voorkomt replay van dezelfde code. */
  timeStep?: number;
}

/**
 * Controleert een ingevoerde code tegen het geheim. `afterTimeStep` (de
 * laatst geaccepteerde stap) wordt door de aanroeper bijgehouden (zie
 * verifyTotpLogin in totp-service.ts) — otplib's eigen
 * replay-bescherming (ingebouwd in de library zelf, niet zelf
 * geïmplementeerd) weigert dan elke stap op of vóór die waarde.
 */
export async function verifyTotpCode(
  secret: string,
  code: string,
  afterTimeStep?: number
): Promise<TotpVerifyResult> {
  if (!/^\d{6}$/.test(code)) return { valid: false };
  const result = await verify({ secret, token: code, crypto, base32, epochTolerance: EPOCH_TOLERANCE, afterTimeStep });
  return result.valid ? { valid: true, timeStep: result.timeStep } : { valid: false };
}
