import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Versleutelt TOTP-geheimen at rest (AES-256-GCM, een beproefde,
// ingebouwde Node.js-primitive — geen zelfbedachte cryptografie). De
// sleutel komt uit MFA_ENCRYPTION_KEY (32 bytes, base64), apart van
// AUTH_SECRET: een TOTP-geheim moet ontcijferbaar blijven (om een code
// te kunnen verifiëren), AUTH_SECRET ondertekent alleen JWT's en hoeft
// dat nooit te zijn.
function encryptionKey(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "MFA_ENCRYPTION_KEY ontbreekt. Genereer er een met `openssl rand -base64 32` en zet 'm als omgevingsvariabele."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("MFA_ENCRYPTION_KEY moet 32 bytes zijn (base64-gecodeerd) — gebruik `openssl rand -base64 32`.");
  }
  return key;
}

/** Versleutelt een geheim tot een zelfstandige, opslaanbare string ("iv:tag:ciphertext", elk base64). */
export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12); // GCM-standaard: 96 bits
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Ongeldig versleuteld geheim.");
  const key = encryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
