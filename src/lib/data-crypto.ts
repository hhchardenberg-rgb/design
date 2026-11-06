import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Versleuteling van gevoelige gegevens in de database en van sponsorbestanden in de opslag
 * (AES-256-GCM). Sleutel: DATA_ENCRYPTION_KEY (32 bytes, base64), los van de andere sleutels.
 *
 * Lezen werkt altijd: een waarde met het voorvoegsel "enc1:" (of een bestand met de kop
 * HHCENC01) wordt ontsleuteld, al het andere is nog platte tekst en blijft gewoon leesbaar.
 * Schrijven versleutelt alleen in productie (of lokaal/tests): een preview deelt de database met
 * productie, en zolang de productiecode dit nog niet kent, zou die anders versleutelde tekst tonen.
 */
const FIELD_PREFIX = "enc1:";
const FILE_MAGIC = Buffer.from("HHCENC01", "ascii");

let cachedKey: Buffer | null | undefined;

function dataKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) return (cachedKey = null);
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY moet 32 bytes zijn (base64), maak er een met `openssl rand -base64 32`.");
  return (cachedKey = key);
}

/** Alleen voor tests: sleutel opnieuw inlezen. */
export function resetDataKeyCache() {
  cachedKey = undefined;
}

/** Mag er nu versleuteld geschreven worden? */
export function encryptionActive(): boolean {
  const env = process.env.VERCEL_ENV;
  return !!dataKey() && (env === "production" || !env);
}

function seal(plain: Buffer, key: Buffer): { iv: Buffer; tag: Buffer; body: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), body };
}

function open(iv: Buffer, tag: Buffer, body: Buffer, key: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export function isEncryptedField(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(FIELD_PREFIX);
}

/** Versleutelt een tekstveld als dat nu kan; anders (of bij leeg/null) ongewijzigd terug. */
export function encryptField<T>(value: T): T {
  if (typeof value !== "string" || value === "" || isEncryptedField(value) || !encryptionActive()) return value;
  const { iv, tag, body } = seal(Buffer.from(value, "utf8"), dataKey()!);
  return (FIELD_PREFIX + Buffer.concat([iv, tag, body]).toString("base64")) as T;
}

/** Ontsleutelt een tekstveld; platte tekst komt ongewijzigd terug. */
export function decryptField<T>(value: T): T {
  if (!isEncryptedField(value)) return value;
  const key = dataKey();
  if (!key) {
    console.error("[data-crypto] versleuteld veld gevonden maar DATA_ENCRYPTION_KEY ontbreekt");
    return "[versleuteld]" as T;
  }
  try {
    const raw = Buffer.from(value.slice(FIELD_PREFIX.length), "base64");
    return open(raw.subarray(0, 12), raw.subarray(12, 28), raw.subarray(28), key).toString("utf8") as T;
  } catch (error) {
    console.error("[data-crypto] veld niet te ontsleutelen", error);
    return "[versleuteld]" as T;
  }
}

export function keyId(): string | null {
  const key = dataKey();
  return key ? createHash("sha256").update("hhc-data-key").update(key).digest("hex").slice(0, 16) : null;
}

export function isEncryptedFile(data: Buffer): boolean {
  return data.length >= 36 && data.subarray(0, 8).equals(FILE_MAGIC);
}

/** Versleutelt bestandsinhoud als dat nu kan. */
export function encryptFile(data: Buffer): Buffer {
  if (isEncryptedFile(data) || !encryptionActive()) return data;
  const { iv, tag, body } = seal(data, dataKey()!);
  return Buffer.concat([FILE_MAGIC, iv, tag, body]);
}

/** Ontsleutelt bestandsinhoud; een onversleuteld bestand komt ongewijzigd terug. */
export function decryptFile(data: Buffer): Buffer {
  if (!isEncryptedFile(data)) return data;
  const key = dataKey();
  if (!key) throw new Error("Dit bestand is versleuteld, maar DATA_ENCRYPTION_KEY ontbreekt.");
  return open(data.subarray(8, 20), data.subarray(20, 36), data.subarray(36), key);
}
