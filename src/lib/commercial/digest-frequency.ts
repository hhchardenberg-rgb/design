import { dayNumber } from "./club-day";

// Hoe vaak de herinneringsmail van Commerciële Zaken komt. De cron draait elke ochtend;
// per ontvanger bepaalt de frequentie of die dag een verzenddag is. Wat tussen twee
// verzenddagen speelt, komt in de eerstvolgende mail.
export const DIGEST_FREQUENCIES = ["DAILY", "TWICE_WEEKLY", "WEEKLY", "BIWEEKLY", "MONTHLY", "OFF"] as const;
export type DigestFrequency = (typeof DIGEST_FREQUENCIES)[number];

/** Zonder ingestelde standaard blijft het zoals het was: elke dag. */
export const DEFAULT_DIGEST_FREQUENCY: DigestFrequency = "DAILY";

export const DIGEST_FREQUENCY_LABELS: Record<DigestFrequency, { label: string; hint: string }> = {
  DAILY: { label: "Dagelijks", hint: "Elke ochtend, alleen als er iets is." },
  TWICE_WEEKLY: { label: "Twee keer per week", hint: "Op maandag- en donderdagochtend." },
  WEEKLY: { label: "Wekelijks", hint: "Op maandagochtend." },
  BIWEEKLY: { label: "Eens per twee weken", hint: "Om de week op maandagochtend." },
  MONTHLY: { label: "Eens per maand", hint: "Op de eerste maandag van de maand." },
  OFF: { label: "Uit", hint: "Geen herinneringsmail." },
};

export const isDigestFrequency = (v: unknown): v is DigestFrequency => typeof v === "string" && (DIGEST_FREQUENCIES as readonly string[]).includes(v);

/** Weekdag van een YYYY-MM-DD: 0 = zondag … 6 = zaterdag. */
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Doorlopend weeknummer (maandag tot en met zondag), zodat "om de week" ook over de jaarwisseling klopt. */
const weekIndex = (iso: string) => Math.floor((dayNumber(iso) + 3) / 7);

/** Of op deze clubdag (YYYY-MM-DD) een mail mag uitgaan bij deze frequentie. */
export function isDigestDay(frequency: DigestFrequency, day: string): boolean {
  const wd = weekday(day);
  switch (frequency) {
    case "DAILY": return true;
    case "TWICE_WEEKLY": return wd === 1 || wd === 4;
    case "WEEKLY": return wd === 1;
    case "BIWEEKLY": return wd === 1 && weekIndex(day) % 2 === 0;
    case "MONTHLY": return wd === 1 && Number(day.slice(8, 10)) <= 7;
    case "OFF": return false;
  }
}

/**
 * De frequentie die voor iemand geldt. Wie de mail vroeger met het vinkje uitzette, houdt hem uit;
 * wie niets koos, volgt de standaard van Commerciële Zaken.
 */
export function effectiveDigestFrequency(user: { notifyCommercialDigest: boolean; commercialDigestFrequency: string | null }, fallback: DigestFrequency): DigestFrequency {
  if (!user.notifyCommercialDigest) return "OFF";
  return isDigestFrequency(user.commercialDigestFrequency) ? user.commercialDigestFrequency : fallback;
}

/** De eerstvolgende verzenddag na deze dag; null bij "uit". Hooguit vijf weken vooruit. */
export function nextDigestDay(frequency: DigestFrequency, day: string): string | null {
  if (frequency === "OFF") return null;
  const start = dayNumber(day);
  for (let n = start + 1; n <= start + 40; n++) {
    const iso = new Date(n * 86_400_000).toISOString().slice(0, 10);
    if (isDigestDay(frequency, iso)) return iso;
  }
  return null;
}
