import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// Beveiligde codes voor interne HHC-tickets (zie docs/hhc-tickets/architectuur.md §4).
//
//   QR:   HHC1.<publicId>.<versie>.<handtekening>
//   Link: <publicId>.<versie>.<handtekening>   (als pad: /t/<...>)
//
// De handtekening is HMAC-SHA256 met TICKETS_SIGNING_KEY, met een domeinlabel ("qr"
// of "link") zodat een link nooit als QR geldt en andersom. Er staat geen
// persoonsgegeven in en in de database wordt geen geheim bewaard: de code is alleen
// met de serversleutel te maken en altijd opnieuw af te leiden. Een versie ophogen
// maakt alle eerdere codes van dat ticket ongeldig. Een geldige handtekening is
// nooit genoeg: de server controleert bij elke scan ook de status.

export const HHC_PREFIX = "HHC1";
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32, zonder I/L/O/U
const PUBLIC_ID_LENGTH = 16; // 80 bits
const SIG_BYTES = 16; // 128 bits

type Purpose = "qr" | "link";

/** Willekeurig, niet-oplopend ticketkenmerk zonder betekenis. */
export function newPublicId(): string {
  const bytes = randomBytes(PUBLIC_ID_LENGTH);
  let out = "";
  for (let i = 0; i < PUBLIC_ID_LENGTH; i++) out += ALPHABET[bytes[i] & 31];
  return out;
}

const PUBLIC_ID_RE = new RegExp(`^[${ALPHABET}]{${PUBLIC_ID_LENGTH}}$`);
const VERSION_RE = /^[1-9]\d{0,5}$/;
const SIG_RE = /^[A-Za-z0-9_-]{22}$/;

// Vaste sleutel voor lokaal ontwikkelen en tests; nooit in een Vercel-omgeving.
const DEV_KEY = Buffer.from("hhc-tickets-local-development-key-not-for-use!!").subarray(0, 32);

let cached: Buffer[] | null = null;

/** Alleen voor tests: sleutels opnieuw inlezen. */
export function resetSigningKeys() {
  cached = null;
}

/**
 * Sleutels uit TICKETS_SIGNING_KEY: "base64" of "kid:base64,kid:base64". De eerste tekent,
 * de overige worden alleen nog geaccepteerd (sleutelrotatie).
 */
export function signingKeys(): Buffer[] {
  if (cached) return cached;
  const raw = process.env.TICKETS_SIGNING_KEY?.trim();
  if (!raw) {
    if (process.env.VERCEL_ENV) throw new Error("TICKETS_SIGNING_KEY ontbreekt: zonder sleutel kunnen er geen tickets worden uitgegeven of gecontroleerd.");
    return (cached = [DEV_KEY]);
  }
  const keys = raw.split(",").map((part) => {
    const b64 = part.includes(":") ? part.slice(part.indexOf(":") + 1) : part;
    const key = Buffer.from(b64.trim(), "base64");
    if (key.length < 32) throw new Error("Elke sleutel in TICKETS_SIGNING_KEY moet minstens 32 bytes zijn (openssl rand -base64 32).");
    return key;
  });
  return (cached = keys);
}

export function isSigningConfigured(): boolean {
  try {
    signingKeys();
    return true;
  } catch {
    return false;
  }
}

function sign(key: Buffer, purpose: Purpose, body: string): string {
  return createHmac("sha256", key).update(`${purpose}|${body}`).digest().subarray(0, SIG_BYTES).toString("base64url");
}

function verify(purpose: Purpose, body: string, sig: string): boolean {
  if (!SIG_RE.test(sig)) return false;
  const given = Buffer.from(sig, "base64url");
  return signingKeys().some((k) => {
    const expected = Buffer.from(sign(k, purpose, body), "base64url");
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

export interface CodeRef {
  publicId: string;
  version: number;
}

/** De QR-inhoud van een ticket. */
export function qrCodeFor(publicId: string, version: number): string {
  const body = `${HHC_PREFIX}.${publicId}.${version}`;
  return `${body}.${sign(signingKeys()[0], "qr", body)}`;
}

/** Het persoonlijke linkkenmerk van een ticket (zonder /t/). */
export function linkTokenFor(publicId: string, version: number): string {
  const body = `${publicId}.${version}`;
  return `${body}.${sign(signingKeys()[0], "link", body)}`;
}

export type TicketSource = "HHC" | "FULLHOUSE";

/**
 * Welke bron hoort bij een gescande code? Alles met het HHC-voorvoegsel is van HHC
 * (ook als de handtekening niet klopt: dan is het een vervalsing, geen Fullhouse-ticket).
 * Al het andere gaat naar de Fullhouse-adapter; het barcodeformaat van Fullhouse is
 * niet gedocumenteerd, dus daar wordt niets van aangenomen.
 */
export function detectSource(raw: string): TicketSource {
  return raw.trim().toUpperCase().startsWith(`${HHC_PREFIX}.`) ? "HHC" : "FULLHOUSE";
}

/** Leest en controleert een HHC-QR. null = ongeldig formaat of handtekening. */
export function parseQrCode(raw: string): CodeRef | null {
  const parts = raw.trim().split(".");
  if (parts.length !== 4) return null;
  const [prefix, publicId, v, sig] = parts;
  if (prefix.toUpperCase() !== HHC_PREFIX || !PUBLIC_ID_RE.test(publicId) || !VERSION_RE.test(v)) return null;
  if (!verify("qr", `${HHC_PREFIX}.${publicId}.${v}`, sig)) return null;
  return { publicId, version: Number(v) };
}

/** Leest en controleert een linkkenmerk. null = ongeldig. */
export function parseLinkToken(raw: string): CodeRef | null {
  const parts = raw.trim().split(".");
  if (parts.length !== 3) return null;
  const [publicId, v, sig] = parts;
  if (!PUBLIC_ID_RE.test(publicId) || !VERSION_RE.test(v)) return null;
  if (!verify("link", `${publicId}.${v}`, sig)) return null;
  return { publicId, version: Number(v) };
}
