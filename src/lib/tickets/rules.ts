// Geldigheidsregels voor interne HHC-tickets. Puur en zonder database, zodat de
// scanner (fase 3), de ticketpagina en het overzicht exact dezelfde regels volgen
// en alles testbaar is. Zie docs/hhc-tickets/architectuur.md §7.

export const TICKET_CATEGORIES = {
  FREE: "Vrijkaart",
  VIP: "VIP-kaart",
  SPONSOR: "Sponsor- en relatiekaart",
  PRESS: "Perskaart",
  STAFF: "Medewerkerskaart",
  BOARD: "Bestuurskaart",
  TEAM: "Spelers- en stafkaart",
  INVITATION: "Uitnodiging",
  PROMOTION: "Actie- en promotieticket",
  SEASON: "Interne seizoenskaart",
} as const;
export type TicketCategory = keyof typeof TICKET_CATEGORIES;
export const TICKET_CATEGORY_KEYS = Object.keys(TICKET_CATEGORIES) as TicketCategory[];
export const isTicketCategory = (v: unknown): v is TicketCategory => typeof v === "string" && v in TICKET_CATEGORIES;

/** Waarvoor een ticket geldig is. */
export const VALIDITY_MODES = {
  SINGLE: "Eén wedstrijd",
  MULTI: "Specifieke wedstrijden",
  SEASON: "Volledig seizoen",
  RANGE: "Periode (van/tot datum)",
} as const;
export type ValidityMode = keyof typeof VALIDITY_MODES;
export const isValidityMode = (v: unknown): v is ValidityMode => typeof v === "string" && v in VALIDITY_MODES;

/** Opgeslagen status. "Verlopen" en "gebruikt" worden afgeleid, nooit opgeslagen. */
export type TicketStatus = "ACTIVE" | "BLOCKED" | "CANCELLED";
export const TICKET_STATUS_LABELS: Record<TicketStatus | "EXPIRED", string> = {
  ACTIVE: "Actief",
  BLOCKED: "Geblokkeerd",
  CANCELLED: "Geannuleerd",
  EXPIRED: "Verlopen",
};

export type EventStatus = "DRAFT" | "ACTIVE" | "CLOSED" | "CANCELLED";
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: "Concept",
  ACTIVE: "Actief",
  CLOSED: "Afgesloten",
  CANCELLED: "Afgelast",
};

export interface RuleTicket {
  status: TicketStatus;
  validityMode: ValidityMode;
  validFrom: Date | null;
  validUntil: Date | null;
  seasonId: string | null;
  /** Leeg = alle competities (alleen bij SEASON). */
  competitions: string[];
  /** Gekoppelde wedstrijden (SINGLE/MULTI). */
  eventIds: string[];
  /** Alleen thuiswedstrijden (SEASON). */
  homeOnly: boolean;
  isSeasonCard: boolean;
  /** Leeg = alle vakken; anders moet het vak van de ingang hierin vallen (fase 3). */
  zoneId: string | null;
}

export interface RuleEvent {
  id: string;
  status: EventStatus;
  seasonId: string | null;
  competition: string | null;
  isHome: boolean;
  startsAt: Date;
  endsAt: Date;
  allowReentry: boolean;
  /** Seizoenskaarten en -passen geven bij deze wedstrijd geen toegang (losse tickets voor dit duel wel). */
  excludeSeasonCards?: boolean;
}

export type ScanReason =
  | "NOT_FOUND"
  | "CANCELLED"
  | "BLOCKED"
  | "EXPIRED"
  | "NOT_YET_VALID"
  | "WRONG_EVENT"
  | "EVENT_NOT_ACTIVE"
  | "WRONG_ZONE"
  | "ALREADY_USED"
  | "OUTDATED"
  | "PROVIDER_DOWN";

export const SCAN_REASON_LABELS: Record<ScanReason, string> = {
  NOT_FOUND: "Ticket bestaat niet",
  CANCELLED: "Ticket is geannuleerd",
  BLOCKED: "Ticket is geblokkeerd",
  EXPIRED: "Ticket is verlopen",
  NOT_YET_VALID: "Ticket is nog niet geldig",
  WRONG_EVENT: "Ticket hoort bij een andere wedstrijd",
  EVENT_NOT_ACTIVE: "Deze wedstrijd is afgelast",
  WRONG_ZONE: "Ticket hoort bij een ander vak dan deze ingang",
  ALREADY_USED: "Ticket is al gebruikt",
  OUTDATED: "Oude versie van dit ticket: er is een nieuwer ticket verstuurd",
  PROVIDER_DOWN: "Fullhouse is niet bereikbaar: ticket kon niet worden gecontroleerd",
};

export type ScanOutcome =
  | { result: "VALID"; reentry: false }
  | { result: "VALID"; reentry: true }
  /** Tweede scan: altijd een waarschuwing, nooit stil geldig. Alleen een supervisor-override kan doorlaten. */
  | { result: "WARNING"; reason: "ALREADY_USED" }
  | { result: "INVALID"; reason: Exclude<ScanReason, "ALREADY_USED" | "OUTDATED" | "PROVIDER_DOWN"> };

/** Valt deze wedstrijd binnen de geldigheid van het ticket (los van status en gebruik)? */
export function coversEvent(t: RuleTicket, e: RuleEvent): boolean {
  switch (t.validityMode) {
    case "SINGLE":
    case "MULTI":
      // Een bewust aan dit duel gekoppeld ticket geldt altijd, ook als seizoenskaarten zijn uitgesloten.
      return t.eventIds.includes(e.id);
  }
  if (t.isSeasonCard && e.excludeSeasonCards) return false;
  switch (t.validityMode) {
    case "SEASON":
      if (!t.seasonId || e.seasonId !== t.seasonId) return false;
      if (t.homeOnly && !e.isHome) return false;
      return t.competitions.length === 0 || (!!e.competition && t.competitions.includes(e.competition));
    case "RANGE":
      return (!t.validFrom || e.startsAt >= t.validFrom) && (!t.validUntil || e.startsAt <= t.validUntil);
  }
}

/**
 * Waarom een seizoenskaart (of seizoenspas) niet geldt voor dit duel, in gewone taal voor de steward en de
 * beheerder. Null als de kaart wel geldt of als het geen seizoenskaart is.
 */
export function seasonCardMismatch(t: RuleTicket, e: RuleEvent, seasonName: (id: string) => string | null = () => null): string | null {
  if (!t.isSeasonCard || t.validityMode === "SINGLE" || t.validityMode === "MULTI" || coversEvent(t, e)) return null;
  if (e.excludeSeasonCards) return "Seizoenskaarten gelden niet voor dit duel.";
  if (t.validityMode === "SEASON") {
    if (!e.seasonId) return "Dit duel hoort nog bij geen seizoen. Koppel het duel aan een seizoen onder Wedstrijden.";
    if (e.seasonId !== t.seasonId) {
      const n = t.seasonId ? seasonName(t.seasonId) : null;
      return n ? `Deze kaart geldt voor seizoen ${n}.` : "Deze kaart geldt voor een ander seizoen.";
    }
    if (t.homeOnly && !e.isHome) return "Deze kaart geldt alleen voor thuisduels.";
    if (t.competitions.length) return `Deze kaart geldt alleen voor: ${t.competitions.join(", ")}.`;
  }
  return null;
}

/** Twee scans van hetzelfde ticket op hetzelfde toestel binnen deze tijd zijn dubbel gescand, geen tweede binnenkomst. */
export const DUPLICATE_SCAN_WINDOW_MS = 2 * 60_000;

/** Is deze scan een dubbele scan (zelfde toestel, kort na een geldige scan)? */
export function isDuplicateScan(previous: { at: Date; device: string | null } | null, current: { at: Date; device: string | null }): boolean {
  if (!previous || !previous.device || previous.device !== current.device) return false;
  const diff = current.at.getTime() - previous.at.getTime();
  return diff >= -5_000 && diff <= DUPLICATE_SCAN_WINDOW_MS;
}

/** Mag dit ticket opnieuw naar binnen bij deze wedstrijd? Alleen seizoenskaarten, en alleen als de wedstrijd het toestaat. */
export function reentryAllowed(t: RuleTicket, e: RuleEvent): boolean {
  return t.isSeasonCard && e.allowReentry;
}

/**
 * De volledige controle voor een scan, in vaste volgorde. `priorAdmissions` is het aantal
 * eerder geregistreerde toegangen van dit ticket bij deze wedstrijd.
 */
export function evaluateScan(t: RuleTicket | null, e: RuleEvent, priorAdmissions: number, now: Date, entranceZoneId: string | null = null): ScanOutcome {
  if (!t) return { result: "INVALID", reason: "NOT_FOUND" };
  if (t.status === "CANCELLED") return { result: "INVALID", reason: "CANCELLED" };
  if (t.status === "BLOCKED") return { result: "INVALID", reason: "BLOCKED" };
  // Alleen een afgelaste wedstrijd kan niet gescand worden; een scanner mag ook concept- of afgesloten wedstrijden kiezen.
  if (e.status === "CANCELLED") return { result: "INVALID", reason: "EVENT_NOT_ACTIVE" };
  if (t.validUntil && now > t.validUntil) return { result: "INVALID", reason: "EXPIRED" };
  if (t.validFrom && now < t.validFrom && t.validityMode === "RANGE") return { result: "INVALID", reason: "NOT_YET_VALID" };
  if (!coversEvent(t, e)) return { result: "INVALID", reason: "WRONG_EVENT" };
  if (t.zoneId && entranceZoneId && t.zoneId !== entranceZoneId) return { result: "INVALID", reason: "WRONG_ZONE" };
  if (priorAdmissions > 0) {
    if (reentryAllowed(t, e)) return { result: "VALID", reentry: true };
    return { result: "WARNING", reason: "ALREADY_USED" };
  }
  return { result: "VALID", reentry: false };
}

/** Status voor overzichten: opgeslagen status, of "Verlopen" als de geldigheid voorbij is. */
export function displayStatus(t: Pick<RuleTicket, "status" | "validUntil">, now: Date): TicketStatus | "EXPIRED" {
  if (t.status !== "ACTIVE") return t.status;
  if (t.validUntil && now > t.validUntil) return "EXPIRED";
  return "ACTIVE";
}

/** Mag een ticket van deze status naar die status? Heractiveren kan niet als het ticket verlopen is. */
export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  if (from === "ACTIVE") return to === "BLOCKED" || to === "CANCELLED";
  if (from === "BLOCKED") return to === "ACTIVE" || to === "CANCELLED";
  // Annuleren is definitief, tenzij een beheerder bewust heractiveert.
  return from === "CANCELLED" && to === "ACTIVE";
}

/**
 * Vervaldatum bij uitgifte: SINGLE/MULTI vervallen automatisch na de laatste gekoppelde
 * wedstrijd, SEASON aan het einde van het seizoen, RANGE op de gekozen einddatum.
 */
export function computeValidUntil(
  mode: ValidityMode,
  input: { events: Pick<RuleEvent, "endsAt">[]; seasonEndsOn?: Date | null; until?: Date | null },
): Date | null {
  switch (mode) {
    case "SINGLE":
    case "MULTI":
      return input.events.length ? new Date(Math.max(...input.events.map((e) => e.endsAt.getTime()))) : null;
    case "SEASON":
      return input.seasonEndsOn ? endOfDay(input.seasonEndsOn) : null;
    case "RANGE":
      return input.until ? endOfDay(input.until) : null;
  }
}

// Kalenderdagen (opgeslagen als middernacht UTC, bv. de begin- en einddatum van een seizoen) worden
// omgezet naar het begin en einde van die dag in Nederlandse tijd. Zo verloopt een kaart om 23:59 in
// Hardenberg, niet om 00:59 of 01:59 de volgende nacht.

const TZ = "Europe/Amsterdam";

/** Verschil tussen Nederlandse tijd en UTC op dit moment, in milliseconden (1 of 2 uur). */
function amsterdamOffsetMs(at: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(at))
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return local - Math.floor(at / 1000) * 1000;
}

/** 00:00 Nederlandse tijd op de kalenderdag van `day` (de UTC-datum van `day`). */
export function amsterdamStartOfDay(day: Date): Date {
  const guess = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  const first = guess - amsterdamOffsetMs(guess);
  return new Date(guess - amsterdamOffsetMs(first));
}

/** 23:59:59,999 Nederlandse tijd op de kalenderdag van `day`. */
export function amsterdamEndOfDay(day: Date): Date {
  const next = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1));
  return new Date(amsterdamStartOfDay(next).getTime() - 1);
}

const endOfDay = amsterdamEndOfDay;

/** Standaard einde van een wedstrijd: aftrap + 6 uur (instelbaar per wedstrijd). */
export const DEFAULT_EVENT_DURATION_HOURS = 6;
export function defaultEndsAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() + DEFAULT_EVENT_DURATION_HOURS * 3_600_000);
}
