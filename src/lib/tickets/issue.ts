import { computeValidUntil, isValidityMode, type ValidityMode } from "./rules";

// Pure bepaling van de geldigheid van een nieuw ticket, uit het tickettype en de keuzes
// van de uitgever. Geen database, zodat dit volledig testbaar is.

export interface TypeForIssue {
  category: string;
  validityMode: string;
  isSeasonCard: boolean;
  seasonId: string | null;
  competitions: string[];
  homeOnly: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  zoneId: string | null;
  active: boolean;
}

export interface EventForIssue {
  id: string;
  status: string;
  endsAt: Date;
}

export interface SeasonForIssue {
  id: string;
  startsOn: Date;
  endsOn: Date;
}

export interface IssueChoice {
  eventIds: string[];
  seasonId: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  zoneId: string | null;
}

export interface ResolvedValidity {
  validityMode: ValidityMode;
  isSeasonCard: boolean;
  seasonId: string | null;
  competitions: string[];
  homeOnly: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  eventIds: string[];
  zoneId: string | null;
}

export type Resolution = { ok: true; value: ResolvedValidity } | { ok: false; message: string };

const fail = (message: string): Resolution => ({ ok: false, message });

export function resolveValidity(
  type: TypeForIssue,
  choice: IssueChoice,
  lookup: { events: EventForIssue[]; season: SeasonForIssue | null },
  now: Date,
): Resolution {
  if (!type.active) return fail("Dit tickettype is niet meer actief.");
  if (!isValidityMode(type.validityMode)) return fail("Dit tickettype heeft een onbekende geldigheid.");
  const mode = type.validityMode;
  const zoneId = choice.zoneId ?? type.zoneId;
  const base = { validityMode: mode, isSeasonCard: type.isSeasonCard, competitions: type.competitions, homeOnly: type.homeOnly, zoneId };

  if (mode === "SINGLE" || mode === "MULTI") {
    const ids = [...new Set(choice.eventIds)];
    if (mode === "SINGLE" && ids.length !== 1) return fail("Kies precies één wedstrijd voor dit tickettype.");
    if (mode === "MULTI" && ids.length < 1) return fail("Kies minstens één wedstrijd voor dit tickettype.");
    const events = lookup.events.filter((e) => ids.includes(e.id));
    if (events.length !== ids.length) return fail("Een van de gekozen wedstrijden bestaat niet (meer).");
    if (events.some((e) => e.status === "CANCELLED" || e.status === "CLOSED")) return fail("Je kunt geen tickets uitgeven voor een afgelaste of afgesloten wedstrijd.");
    const validUntil = computeValidUntil(mode, { events });
    if (validUntil && validUntil < now) return fail("De gekozen wedstrijd is al voorbij.");
    return { ok: true, value: { ...base, seasonId: null, validFrom: null, validUntil, eventIds: ids } };
  }

  if (mode === "SEASON") {
    const seasonId = choice.seasonId ?? type.seasonId;
    if (!seasonId) return fail("Kies het seizoen waarvoor deze seizoenskaart geldt.");
    if (!lookup.season || lookup.season.id !== seasonId) return fail("Het gekozen seizoen bestaat niet (meer).");
    const validUntil = computeValidUntil("SEASON", { events: [], seasonEndsOn: lookup.season.endsOn });
    if (validUntil && validUntil < now) return fail("Dit seizoen is al afgelopen.");
    return { ok: true, value: { ...base, seasonId, validFrom: lookup.season.startsOn, validUntil, eventIds: [] } };
  }

  // RANGE
  const from = choice.validFrom ?? type.validFrom;
  const until = choice.validUntil ?? type.validUntil;
  if (!until) return fail("Kies tot wanneer dit ticket geldig is.");
  if (from && until < from) return fail("De einddatum moet na de begindatum liggen.");
  const validUntil = computeValidUntil("RANGE", { events: [], until });
  if (validUntil && validUntil < now) return fail("De einddatum ligt in het verleden.");
  return { ok: true, value: { ...base, seasonId: null, validFrom: from, validUntil, eventIds: [] } };
}

/** Moet een uitgifte van dit aantal tickets eerst worden goedgekeurd? */
export function needsApproval(count: number, threshold: number): boolean {
  return count > threshold;
}

/** Initialen in plaats van een naam, voor wie geen contactgegevens mag zien. */
export function initialsOf(firstName: string, lastName: string): string {
  const letter = (s: string) => (s.trim()[0] ?? "").toUpperCase();
  const last = lastName
    .trim()
    .split(/\s+/)
    .filter((p) => p && p[0] === p[0].toUpperCase())
    .pop();
  return [letter(firstName), letter(last ?? lastName)].filter(Boolean).join(".") + ".";
}
