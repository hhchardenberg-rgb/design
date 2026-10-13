import { CLUB_TIME_ZONE } from "@/lib/timezone";

/** Kalenderdag in de clubtijdzone als YYYY-MM-DD. */
export function clubDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLUB_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
/** Dagnummer van een YYYY-MM-DD, om dagen te kunnen aftrekken zonder zomertijd-ruis. */
export const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
