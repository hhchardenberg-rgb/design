import { createHmac, timingSafeEqual } from "node:crypto";

// Pure hulpfuncties (zonder database) voor afmeldlinks en webhook-handtekeningen.

const b64url = (buf: Buffer) => buf.toString("base64url");

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET ontbreekt; afmeldlinks kunnen niet worden ondertekend.");
  return s;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

function sign(email: string): string {
  return b64url(createHmac("sha256", secret()).update(`unsubscribe:${normalizeEmail(email)}`).digest());
}

/** Onderdelen voor de afmeldlink; de handtekening bewijst dat de link van ons komt zonder dat de ontvanger kan inloggen. */
export function unsubscribeParams(email: string): { e: string; t: string } {
  return { e: b64url(Buffer.from(normalizeEmail(email))), t: sign(email) };
}

export function readUnsubscribeParams(e: string | null, t: string | null): string | null {
  if (!e || !t) return null;
  try {
    const email = Buffer.from(e, "base64url").toString("utf8");
    if (!email || email.length > 320) return null;
    const want = Buffer.from(sign(email));
    const got = Buffer.from(t);
    return want.length === got.length && timingSafeEqual(want, got) ? normalizeEmail(email) : null;
  } catch {
    return null;
  }
}

/**
 * Controleert een Svix-handtekening (zo ondertekent Resend webhooks): HMAC-SHA256 over `${id}.${timestamp}.${body}`
 * met de sleutel uit het geheim (`whsec_<base64>`). Verouderde of toekomstige tijdstempels worden geweigerd.
 */
export function verifyWebhookSignature(opts: { secret: string; id: string | null; timestamp: string | null; signature: string | null; body: string; now?: Date; toleranceSeconds?: number }): boolean {
  const { id, timestamp, signature, body } = opts;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  const now = (opts.now ?? new Date()).getTime() / 1000;
  if (!Number.isFinite(ts) || Math.abs(now - ts) > (opts.toleranceSeconds ?? 300)) return false;
  const key = Buffer.from(opts.secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  // Header kan meerdere handtekeningen bevatten: "v1,abc v1,def".
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const got = Buffer.from(value, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
