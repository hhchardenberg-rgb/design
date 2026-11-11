import { createHmac, timingSafeEqual } from "crypto";

/** vivenu: header x-vivenu-signature = hex HMAC-SHA256 van de ruwe body met de webhooksleutel. */
export function verifyFullhouseSignature(secret: string, rawBody: string, header: string | null): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = header.trim().toLowerCase();
  if (given.length !== expected.length || !/^[0-9a-f]+$/.test(given)) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}
