// Seizoenen benoemen zoals de club ze noemt: huidig, afgelopen of aankomend seizoen.
// Afgeleid van de datums ten opzichte van vandaag (clubtijd); los van de beheerstatus.
import { clubDay } from "./club-day";

export type SeasonPhase = "CURRENT" | "PAST" | "UPCOMING";

export const SEASON_PHASE_LABEL: Record<SeasonPhase, string> = { CURRENT: "Huidig seizoen", PAST: "Afgelopen seizoen", UPCOMING: "Aankomend seizoen" };
const SHORT: Record<SeasonPhase, string> = { CURRENT: "huidig", PAST: "afgelopen", UPCOMING: "aankomend" };

/** startsOn/endsOn als YYYY-MM-DD (of ISO-tijdstip). */
export function seasonPhase(s: { startsOn: string; endsOn: string }, today: string = clubDay(new Date())): SeasonPhase {
  if (today < s.startsOn.slice(0, 10)) return "UPCOMING";
  if (today > s.endsOn.slice(0, 10)) return "PAST";
  return "CURRENT";
}

/** Naam voor keuzelijsten: "2026/2027 (huidig)". */
export function seasonOptionLabel(s: { name: string; startsOn: string; endsOn: string }, today?: string): string {
  return `${s.name} (${SHORT[seasonPhase(s, today)]})`;
}
