import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Versleuteling van back-ups (AES-256-GCM, ingebouwd in Node.js). De sleutel staat in
 * BACKUP_ENCRYPTION_KEY (32 bytes, base64) en is bewust een andere dan AUTH_SECRET en
 * MFA_ENCRYPTION_KEY: wie een back-up kan lezen, kan daarmee niet inloggen of codes namaken,
 * en andersom. Bewaar deze sleutel ook buiten Vercel (wachtwoordkluis): zonder sleutel is een
 * back-up onleesbaar, ook voor ons.
 *
 * Bestandsopbouw: MAGIC (8) | sleutel-vingerafdruk (8) | iv (12) | tag (16) | versleutelde inhoud.
 * De vingerafdruk is geen geheim; hij vertelt bij herstel alleen met welke sleutel het bestand
 * gemaakt is, zodat een verkeerde sleutel een duidelijke melding geeft.
 */
export const MAGIC = Buffer.from("HHCBAK01", "ascii");
const HEADER_BYTES = 8 + 8 + 12 + 16;
export const ENCRYPTION_OVERHEAD = HEADER_BYTES;

export function parseKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error("BACKUP_ENCRYPTION_KEY ontbreekt. Maak er een met `openssl rand -base64 32`.");
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY moet 32 bytes zijn (base64), maak er een met `openssl rand -base64 32`.");
  return key;
}

export function keyFingerprint(key: Buffer): Buffer {
  return createHash("sha256").update("hhc-backup-key").update(key).digest().subarray(0, 8);
}

export function fingerprintHex(key: Buffer): string {
  return keyFingerprint(key).toString("hex");
}

export function encryptBackup(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const fp = keyFingerprint(key);
  // De kop (magic + vingerafdruk) telt mee als geauthenticeerde data: knoeien daarmee faalt bij ontsleutelen.
  cipher.setAAD(Buffer.concat([MAGIC, fp]));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, fp, iv, cipher.getAuthTag(), body]);
}

export function isEncryptedBackup(data: Buffer): boolean {
  return data.length >= HEADER_BYTES && data.subarray(0, 8).equals(MAGIC);
}

export function decryptBackup(data: Buffer, key: Buffer): Buffer {
  if (!isEncryptedBackup(data)) throw new Error("Dit is geen versleuteld back-upbestand van de Hub.");
  const fp = data.subarray(8, 16);
  if (!fp.equals(keyFingerprint(key))) {
    throw new Error(`Verkeerde sleutel: dit bestand is versleuteld met sleutel ${fp.toString("hex")}, de opgegeven sleutel is ${fingerprintHex(key)}.`);
  }
  const iv = data.subarray(16, 28);
  const tag = data.subarray(28, 44);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.concat([MAGIC, fp]));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data.subarray(44)), decipher.final()]);
}
