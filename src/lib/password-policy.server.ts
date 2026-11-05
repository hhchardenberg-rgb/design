import { createHash } from "crypto";
import { ApiError } from "@/lib/api-guards";

/** Minimale lengte van een zelfgekozen wachtwoord. Bestaande wachtwoorden blijven geldig. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

/**
 * Hoe vaak dit wachtwoord in bekende datalekken voorkomt, via Have I Been Pwned. Anoniem
 * ("k-anonymity"): alleen de eerste 5 tekens van de SHA-1-hash gaan de deur uit, nooit het
 * wachtwoord zelf. Bij een storing (geen internet, timeout) geeft dit null en gaat het door.
 */
export async function breachCount(password: string, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "HHC-Hardenberg-Hub" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    for (const line of (await res.text()).split("\n")) {
      const [hash, count] = line.trim().split(":");
      if (hash === suffix) return Number(count) || 0;
    }
    return 0;
  } catch (error) {
    console.warn("[password-policy] controle op gelekte wachtwoorden niet bereikbaar", error);
    return null;
  }
}

/** Controleert een nieuw wachtwoord; gooit een ApiError (400) met een begrijpelijke melding. */
export async function assertStrongPassword(password: unknown, context: { email?: string | null; name?: string | null } = {}, fetchImpl?: typeof fetch) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    throw new ApiError(400, `Wachtwoord moet minimaal ${PASSWORD_MIN_LENGTH} tekens zijn.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) throw new ApiError(400, "Wachtwoord is te lang.");
  const lower = password.toLowerCase();
  const email = context.email?.toLowerCase();
  if (email && (lower === email || lower === email.split("@")[0])) throw new ApiError(400, "Kies een wachtwoord dat niet je e-mailadres is.");
  if (/^(.)\1+$/.test(password)) throw new ApiError(400, "Kies een wachtwoord dat niet uit één herhaald teken bestaat.");
  const count = await breachCount(password, fetchImpl);
  if (count && count > 0) {
    throw new ApiError(400, "Dit wachtwoord komt voor in bekende datalekken en is daardoor makkelijk te raden. Kies een ander wachtwoord.");
  }
}
