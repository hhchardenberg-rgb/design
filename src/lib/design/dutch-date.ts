/**
 * Een datumveld bewaart de tekst die op de afbeelding komt ("Zondag 18
 * oktober"). Om de datumkiezer bij heropenen weer te vullen, wordt die
 * tekst terugvertaald naar een datum: het jaar volgt uit de weekdag.
 */
const WEEKDAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-18" → "Zondag 18 oktober". */
export function formatDutchDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const weekday = WEEKDAYS[date.getUTCDay()];
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/**
 * Terug naar "jjjj-mm-dd", of null als de tekst geen herkenbare datum is.
 * Zonder jaartal kiest hij het jaar (rond `today`) waarin de weekdag klopt.
 */
export function parseDutchDate(text: string, today = new Date()): string | null {
  const value = text.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const m = /^(?:([a-z]+)\s+)?(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/.exec(value);
  if (!m) return null;
  const weekday = m[1] ? WEEKDAYS.indexOf(m[1]) : -1;
  if (m[1] && weekday < 0) return null;
  const day = Number(m[2]);
  const month = MONTHS.indexOf(m[3]);
  if (month < 0 || day < 1 || day > 31) return null;

  const valid = (year: number) => {
    const d = new Date(Date.UTC(year, month, day));
    return d.getUTCMonth() === month && (weekday < 0 || d.getUTCDay() === weekday);
  };
  const iso = (year: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
  if (m[4]) return valid(Number(m[4])) ? iso(Number(m[4])) : null;

  const base = today.getFullYear();
  const candidates = [base, base + 1, base - 1, base + 2, base - 2, base + 3, base - 3].filter(valid);
  if (!candidates.length) return null;
  const now = today.getTime();
  candidates.sort((a, b) => Math.abs(Date.UTC(a, month, day) - now) - Math.abs(Date.UTC(b, month, day) - now));
  return iso(candidates[0]);
}
