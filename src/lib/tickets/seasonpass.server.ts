import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAudit, ticketAuditTx } from "./audit.server";
import { need, type TicketsActor } from "./authz.server";
import { initialsOf } from "./issue";
import { formatDay, formatDayTime } from "@/lib/date-format";
import { seasonOptionLabel } from "@/lib/commercial/season-phase";
import { toXlsxBook, type Cell } from "./export";
import { amsterdamCalendarDay, seasonMaintenance } from "./season-link.server";
import { coversEvent, type RuleEvent, type RuleTicket, type TicketStatus, type ValidityMode } from "./rules";
import { holderSchema, issueSchema } from "./schemas";
import { issueTickets } from "./tickets.server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { fullhouseSeasonCards, seasonCardSources } from "./fullhouse-season.server";
import { isSeasonCardSource } from "./season-cards";

// Seizoenspassen: gebruik per houder en duel, no-show-overzicht, verlengen naar een volgend seizoen
// en overdragen aan een andere houder.

const actorOf = (a: TicketsActor) => ({ id: a.id, name: a.name });
const CARD_SELECT = { id: true, publicId: true, firstName: true, lastName: true, typeId: true, zoneId: true, status: true, validityMode: true, validFrom: true, validUntil: true, seasonId: true, competitions: true, homeOnly: true, isSeasonCard: true, createdAt: true, type: { select: { name: true } }, zone: { select: { name: true } } } as const;
const EVENT_SELECT = { id: true, title: true, startsAt: true, endsAt: true, status: true, seasonId: true, competition: true, isHome: true, allowReentry: true, excludeSeasonCards: true } as const;

type EventRow = { id: string; title: string; startsAt: Date; endsAt: Date; status: string; seasonId: string | null; competition: string | null; isHome: boolean; allowReentry: boolean; excludeSeasonCards?: boolean };
type CardRow = { id: string; status: string; validityMode: string; validFrom: Date | null; validUntil: Date | null; seasonId: string | null; competitions: string[]; homeOnly: boolean; isSeasonCard: boolean; zoneId: string | null; createdAt?: Date };

const ruleEvent = (e: EventRow): RuleEvent => ({ id: e.id, status: e.status as RuleEvent["status"], seasonId: e.seasonId, competition: e.competition, isHome: e.isHome, startsAt: e.startsAt, endsAt: e.endsAt, allowReentry: e.allowReentry, excludeSeasonCards: !!e.excludeSeasonCards });
const ruleTicket = (t: CardRow): RuleTicket => ({ status: t.status as TicketStatus, validityMode: t.validityMode as ValidityMode, validFrom: t.validFrom, validUntil: t.validUntil, seasonId: t.seasonId, competitions: t.competitions, eventIds: [], homeOnly: t.homeOnly, isSeasonCard: t.isSeasonCard, zoneId: t.zoneId });

/** Was de pas er al bij dit duel? Een pas die halverwege het seizoen is uitgegeven, telt niet mee voor duels die toen al voorbij waren. */
const issuedBefore = (card: CardRow, e: EventRow) => !card.createdAt || e.endsAt >= card.createdAt;

/** Duels waar deze pas voor geldt (zonder afgelaste en uitgesloten duels), op volgorde van aftrap. Puur, dus testbaar. */
export function eligibleEvents(card: CardRow, events: EventRow[]): EventRow[] {
  const rt = ruleTicket(card);
  return events.filter((e) => e.status !== "CANCELLED" && issuedBefore(card, e) && coversEvent(rt, ruleEvent(e))).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export type GameState = "ATTENDED" | "MISSED" | "UPCOMING" | "CANCELLED" | "EXCLUDED" | "NOT_ISSUED";
export const GAME_STATE_LABELS: Record<GameState, string> = {
  ATTENDED: "Geweest",
  MISSED: "Niet geweest",
  UPCOMING: "Nog te spelen",
  CANCELLED: "Afgelast",
  EXCLUDED: "Geen toegang met seizoenskaart",
  NOT_ISSUED: "Pas nog niet uitgegeven",
};

/**
 * Stand van een pas bij één duel, of null als het duel nooit voor deze pas bedoeld was (uitduel, andere competitie).
 * Puur, dus testbaar.
 */
export function gameState(card: CardRow, e: EventRow, attended: boolean, now: Date): GameState | null {
  const rt = ruleTicket(card);
  const re = ruleEvent(e);
  if (!coversEvent(rt, { ...re, excludeSeasonCards: false })) return attended ? "ATTENDED" : null;
  if (attended) return "ATTENDED";
  if (re.excludeSeasonCards) return "EXCLUDED";
  if (e.status === "CANCELLED") return "CANCELLED";
  if (!issuedBefore(card, e)) return "NOT_ISSUED";
  return e.startsAt <= now ? "MISSED" : "UPCOMING";
}

/** Aantal duels op rij (vanaf het laatste) waar de houder niet was; 0 als de laatste wel bezocht is. */
export function missedStreak(pastEligibleIds: string[], attended: Set<string>): number {
  let n = 0;
  for (let i = pastEligibleIds.length - 1; i >= 0; i--) {
    if (attended.has(pastEligibleIds[i])) break;
    n++;
  }
  return n;
}

export type PassFilter = "all" | "noshow" | "streak";

// ── Houders: eigen seizoenskaarten (HHC) en seizoenskaarten/-passen uit Fullhouse ──

/**
 * Eén houder van een seizoenskaart, ongeacht de bron. `key` is waaronder scans worden gevonden: het ticket-id
 * (HHC) of de hash van de barcode (Fullhouse). Van Fullhouse-houders kennen we alleen initialen.
 */
export type Holder = { key: string; id: string; publicId: string; name: string; type: string; zone: string | null; source: "HHC" | "FULLHOUSE"; card: CardRow };

const FH_PREFIX = "fh_";
const fhKey = (hash: string) => `h:${hash}`;

/** Fullhouse-kaart als CardRow: geldig voor alle thuisduels van het seizoen, vanaf het verkoopmoment. Puur, dus testbaar. */
export function fullhouseCardRow(c: { id: string; soldAt: Date | null }, seasonId: string): CardRow {
  return { id: `${FH_PREFIX}${c.id}`, status: "ACTIVE", validityMode: "SEASON", validFrom: null, validUntil: null, seasonId, competitions: [], homeOnly: true, isSeasonCard: true, zoneId: null, createdAt: c.soldAt ?? undefined };
}

async function loadHolders(seasonId: string, personal: boolean): Promise<Holder[]> {
  const [cards, fh] = await Promise.all([
    prisma.ticket.findMany({ where: { isSeasonCard: true, source: "HHC", anonymizedAt: null, status: "ACTIVE", seasonId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: CARD_SELECT }),
    fullhouseSeasonCards(seasonId),
  ]);
  const own: Holder[] = cards.map((c) => ({ key: c.id, id: c.id, publicId: c.publicId, name: personal ? `${c.firstName} ${c.lastName}` : initialsOf(c.firstName, c.lastName), type: c.type.name, zone: c.zone?.name ?? null, source: "HHC", card: c }));
  const seen = new Set<string>();
  const ext: Holder[] = [];
  for (const c of fh) {
    if (seen.has(c.codeHash)) continue;
    seen.add(c.codeHash);
    ext.push({ key: fhKey(c.codeHash), id: `${FH_PREFIX}${c.id}`, publicId: "Fullhouse", name: c.holderLabel || "Onbekend", type: c.ticketName ?? "Seizoenskaart", zone: c.area, source: "FULLHOUSE", card: fullhouseCardRow(c, seasonId) });
  }
  return [...own, ...ext];
}

type ScanHit = { key: string; eventId: string; scannedAt: Date; entranceId: string | null; reentry: boolean };

/** Geldige scans van deze houders bij deze duels, met de houder-sleutel erbij. */
async function loadScans(holders: Holder[], eventIds: string[]): Promise<ScanHit[]> {
  if (!holders.length || !eventIds.length) return [];
  const ids = holders.filter((h) => h.source === "HHC").map((h) => h.id);
  const hashes = holders.filter((h) => h.source === "FULLHOUSE").map((h) => h.key.slice(2));
  const rows = await prisma.ticketScan.findMany({
    where: { eventId: { in: eventIds }, result: "VALID", OR: [...(ids.length ? [{ ticketId: { in: ids } }] : []), ...(hashes.length ? [{ codeHash: { in: hashes }, ticketId: null }] : [])] },
    select: { ticketId: true, codeHash: true, eventId: true, scannedAt: true, entranceId: true, reentry: true },
  });
  return rows.flatMap((r) => {
    const key = r.ticketId ?? (r.codeHash ? fhKey(r.codeHash) : null);
    return key ? [{ key, eventId: r.eventId, scannedAt: r.scannedAt, entranceId: r.entranceId, reentry: r.reentry }] : [];
  });
}

/** Eerste geldige scan per houder per duel ("sleutel|eventId"). Ongedaan gemaakte scans tellen niet. */
function firstScans(scans: ScanHit[]) {
  const first = new Map<string, ScanHit>();
  for (const s of scans) {
    const k = `${s.key}|${s.eventId}`;
    const cur = first.get(k);
    if (!cur || s.scannedAt < cur.scannedAt) first.set(k, s);
  }
  return first;
}

/** Duels van een seizoen, zonder de Fullhouse-evenementen waarop de seizoenskaarten zelf verkocht worden. */
async function seasonEvents(seasonId: string, extra: Prisma.TicketEventWhereInput = {}) {
  const rows = await prisma.ticketEvent.findMany({ where: { seasonId, ...extra }, orderBy: { startsAt: "asc" }, select: { ...EVENT_SELECT, source: true, seasonCardSource: true } });
  return rows.filter((e) => !isSeasonCardSource(e));
}

export async function seasonPassOverview(actor: TicketsActor, opts: { seasonId?: string; q?: string; filter?: PassFilter }) {
  need(actor, "tickets:read");
  const personal = actor.access.can("tickets:personal");
  const now = new Date();
  const { seasons: rawSeasons, season } = await pickSeasonFor(opts.seasonId, now);
  const seasons = rawSeasons.map((x) => ({ id: x.id, name: x.name, label: labelOf(x) }));
  if (!season) return { seasons, season: null, summary: null, rows: [] as never[], personal };

  const [events, holders] = await Promise.all([seasonEvents(season.id, { status: { not: "CANCELLED" } }), loadHolders(season.id, personal)]);
  const pastEvents = events.filter((e) => e.startsAt <= now);
  const scans = await loadScans(holders, pastEvents.map((e) => e.id));
  const attendedBy = new Map<string, Set<string>>();
  const lastBy = new Map<string, Date>();
  for (const s of scans) {
    (attendedBy.get(s.key) ?? attendedBy.set(s.key, new Set()).get(s.key)!).add(s.eventId);
    if (!lastBy.get(s.key) || s.scannedAt > lastBy.get(s.key)!) lastBy.set(s.key, s.scannedAt);
  }

  const q = opts.q?.trim().toLowerCase();
  let rows = holders.map((h) => {
    const past = eligibleEvents(h.card, pastEvents);
    const attended = attendedBy.get(h.key) ?? new Set<string>();
    const came = past.filter((e) => attended.has(e.id)).length;
    return {
      id: h.id,
      publicId: h.publicId,
      source: h.source,
      name: h.name,
      type: h.type,
      zone: h.zone,
      eligible: past.length,
      attended: came,
      streak: missedStreak(past.map((e) => e.id), attended),
      lastSeen: lastBy.get(h.key)?.toISOString() ?? null,
    };
  });
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q) || (r.source === "HHC" && r.publicId.toLowerCase().startsWith(q)));
  const withGames = rows.filter((r) => r.eligible > 0);
  const summary = {
    passes: rows.length,
    fullhouse: rows.filter((r) => r.source === "FULLHOUSE").length,
    pastGames: pastEvents.length,
    upcomingGames: events.length - pastEvents.length,
    averagePct: withGames.length ? Math.round((withGames.reduce((n, r) => n + r.attended / r.eligible, 0) / withGames.length) * 100) : null,
    noShow: rows.filter((r) => r.eligible >= 2 && r.attended === 0).length,
    streak3: rows.filter((r) => r.streak >= 3).length,
  };
  if (opts.filter === "noshow") rows = rows.filter((r) => r.eligible >= 2 && r.attended === 0);
  if (opts.filter === "streak") rows = rows.filter((r) => r.streak >= 3);
  rows.sort((a, b) => (opts.filter ? b.streak - a.streak : 0) || a.name.localeCompare(b.name, "nl"));
  return { seasons, season: { id: season.id, name: season.name, label: labelOf(season) }, summary, rows: rows.slice(0, 500), personal };
}

// ── Seizoenen kiezen ──

type SeasonRow = { id: string; name: string; startsOn: Date; endsOn: Date };

/** "huidig", "afgelopen" of "aankomend" seizoen (zo heten seizoenen in de Hub). */
export function phaseOf(s: Pick<SeasonRow, "startsOn" | "endsOn">, now: Date): "current" | "past" | "upcoming" {
  const day = amsterdamCalendarDay(now).getTime();
  if (s.endsOn.getTime() < day) return "past";
  if (s.startsOn.getTime() > day) return "upcoming";
  return "current";
}

/** "2026/2027 (huidig)", zoals in de rest van de Hub. */
const labelOf = (s: Pick<SeasonRow, "name" | "startsOn" | "endsOn">) => seasonOptionLabel({ name: s.name, startsOn: s.startsOn.toISOString(), endsOn: s.endsOn.toISOString() });

/** Gekozen seizoen, anders het huidige, anders het meest recente. Koppelt eerst duels zonder seizoen. */
async function pickSeasonFor(seasonId: string | undefined, now: Date) {
  await seasonMaintenance();
  const seasons = await prisma.ticketSeason.findMany({ orderBy: { startsOn: "desc" } });
  const season = seasons.find((s) => s.id === seasonId) ?? seasons.find((s) => phaseOf(s, now) === "current") ?? seasons[0] ?? null;
  return { seasons, season };
}

// ── Aanwezigheid per duel ──

async function seasonData(seasonId: string, personal: boolean) {
  const [events, holders] = await Promise.all([seasonEvents(seasonId), loadHolders(seasonId, personal)]);
  const scans = await loadScans(holders, events.map((e) => e.id));
  return { events, holders, first: firstScans(scans) };
}

/** Per duel van het seizoen: hoeveel houders erbij hoorden, hoeveel er waren en hoeveel niet. */
export async function seasonAttendanceByEvent(actor: TicketsActor, opts: { seasonId?: string }) {
  need(actor, "tickets:read");
  const now = new Date();
  const { seasons: rawSeasons, season } = await pickSeasonFor(opts.seasonId, now);
  const seasons = rawSeasons.map((x) => ({ id: x.id, name: x.name, label: labelOf(x) }));
  if (!season) return { seasons, season: null, events: [] as never[] };
  const { events, holders, first } = await seasonData(season.id, false);
  return {
    seasons,
    season: { id: season.id, name: season.name, label: labelOf(season) },
    events: events.map((e) => {
      let expected = 0;
      let present = 0;
      for (const h of holders) {
        const st = gameState(h.card, e, first.has(`${h.key}|${e.id}`), now);
        if (st === "ATTENDED") present++;
        if (st === "ATTENDED" || st === "MISSED" || st === "UPCOMING") expected++;
      }
      const past = e.startsAt <= now;
      const live = past && e.endsAt > now;
      return {
        id: e.id,
        title: e.title,
        startsAt: e.startsAt.toISOString(),
        status: e.status,
        excluded: !!e.excludeSeasonCards,
        past,
        live,
        expected,
        present,
        absent: past && e.status !== "CANCELLED" ? Math.max(0, expected - present) : null,
        pct: past && expected > 0 && e.status !== "CANCELLED" ? Math.round((present / expected) * 100) : null,
      };
    }),
  };
}

export type AttendanceFilter = "all" | "present" | "absent";

/** Per duel: welke seizoenskaarthouders (eigen en Fullhouse) waren er wel en welke niet. */
export async function eventAttendance(actor: TicketsActor, eventId: string, opts: { filter?: AttendanceFilter; q?: string } = {}) {
  need(actor, "tickets:read");
  const personal = actor.access.can("tickets:personal");
  const now = new Date();
  await seasonMaintenance();
  const event = await prisma.ticketEvent.findUnique({ where: { id: eventId }, select: { ...EVENT_SELECT, source: true, seasonCardSource: true, season: { select: { id: true, name: true, startsOn: true, endsOn: true } } } });
  if (!event) throw new ApiError(404, "Wedstrijd niet gevonden.");
  const holders = event.seasonId && !isSeasonCardSource(event) ? await loadHolders(event.seasonId, personal) : [];
  const scans = await loadScans(holders, [eventId]);
  const first = firstScans(scans);
  const reentries = new Map<string, number>();
  for (const s of scans) if (s.reentry) reentries.set(s.key, (reentries.get(s.key) ?? 0) + 1);
  const entrances = new Map((await prisma.ticketEntrance.findMany({ select: { id: true, name: true } })).map((e) => [e.id, e.name]));

  let rows = holders
    .map((h) => {
      const hit = first.get(`${h.key}|${eventId}`);
      const state = gameState(h.card, event, !!hit, now);
      if (!state) return null;
      return {
        id: h.id,
        publicId: h.publicId,
        source: h.source,
        name: h.name,
        type: h.type,
        zone: h.zone,
        state,
        stateLabel: GAME_STATE_LABELS[state],
        firstAt: hit?.scannedAt.toISOString() ?? null,
        entrance: (hit?.entranceId && entrances.get(hit.entranceId)) || null,
        reentries: reentries.get(h.key) ?? 0,
      };
    })
    .filter((r): r is NonNullable<typeof r> => !!r);
  const counted = rows.filter((r) => r.state === "ATTENDED" || r.state === "MISSED" || r.state === "UPCOMING");
  const summary = {
    expected: counted.length,
    present: rows.filter((r) => r.state === "ATTENDED").length,
    absent: rows.filter((r) => r.state === "MISSED").length,
  };
  const q = opts.q?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q) || (r.source === "HHC" && r.publicId.toLowerCase().startsWith(q)));
  if (opts.filter === "present") rows = rows.filter((r) => r.state === "ATTENDED");
  if (opts.filter === "absent") rows = rows.filter((r) => r.state !== "ATTENDED");
  const past = event.startsAt <= now;
  return {
    event: { id: event.id, title: event.title, startsAt: event.startsAt.toISOString(), status: event.status, excluded: !!event.excludeSeasonCards, allowReentry: event.allowReentry, past, live: past && event.endsAt > now },
    season: event.season ? { id: event.season.id, name: event.season.name, label: labelOf(event.season) } : null,
    summary,
    rows: rows.slice(0, 2000),
    personal,
  };
}

// ── Export ──

const MARK: Record<GameState, string> = { ATTENDED: "✓", MISSED: "✗", UPCOMING: "", CANCELLED: "afgelast", EXCLUDED: "n.v.t.", NOT_ISSUED: "" };

/**
 * Excel met de aanwezigheid van alle seizoenskaarthouders (eigen en Fullhouse): één blad met houders × duels
 * (✓ geweest, ✗ niet geweest), één blad met de stand per duel, en per gespeeld duel een blad met wie er wel en niet was.
 */
export async function seasonAttendanceExport(actor: TicketsActor, seasonId?: string) {
  need(actor, "tickets:read");
  need(actor, "exports:export");
  const personal = actor.access.can("tickets:personal");
  const now = new Date();
  const { season } = await pickSeasonFor(seasonId, now);
  if (!season) throw new ApiError(404, "Er is nog geen seizoen aangemaakt.");
  const { events, holders, first } = await seasonData(season.id, personal);
  const entrances = new Map((await prisma.ticketEntrance.findMany({ select: { id: true, name: true } })).map((e) => [e.id, e.name]));
  const st = (h: Holder, e: (typeof events)[number]) => gameState(h.card, e, first.has(`${h.key}|${e.id}`), now);
  // Alleen duels die voor minstens één pas bedoeld zijn (geen uitduels of andere competities zonder kaarthouders).
  const relevant = events.filter((e) => holders.some((h) => st(h, e) !== null));
  const label = (e: (typeof events)[number]) => `${e.title} (${formatDay(e.startsAt)})`;
  const sourceLabel = (h: Holder) => (h.source === "FULLHOUSE" ? "Fullhouse" : "HHC");

  const matrix: Cell[][] = [["Houder", "Ticketnummer", "Bron", "Soort", "Vak", "Geweest", "Gespeelde duels", "Opkomst %", ...relevant.map(label)]];
  for (const h of holders) {
    const states = relevant.map((e) => st(h, e));
    const came = states.filter((x) => x === "ATTENDED").length;
    const played = states.filter((x) => x === "ATTENDED" || x === "MISSED").length;
    matrix.push([h.name, h.source === "HHC" ? h.publicId : "", sourceLabel(h), h.type, h.zone ?? "", came, played, played ? Math.round((came / played) * 100) : "", ...states.map((x) => (x ? MARK[x] : "–"))]);
  }

  const perEvent: Cell[][] = [["Duel", "Datum", "Status", "Seizoenskaarten", "Verwacht", "Aanwezig", "Niet aanwezig", "Opkomst %"]];
  const sheets: { name: string; rows: Cell[][] }[] = [];
  for (const e of relevant) {
    const rows = holders.map((h) => ({ h, st: st(h, e), hit: first.get(`${h.key}|${e.id}`) })).filter((x) => x.st !== null);
    const expected = rows.filter((x) => x.st === "ATTENDED" || x.st === "MISSED" || x.st === "UPCOMING").length;
    const present = rows.filter((x) => x.st === "ATTENDED").length;
    const past = e.startsAt <= now && e.status !== "CANCELLED";
    perEvent.push([e.title, formatDayTime(e.startsAt), e.status === "CANCELLED" ? "Afgelast" : past ? "Gespeeld" : "Nog te spelen", e.excludeSeasonCards ? "Uitgesloten" : "Geldig", expected, past ? present : "", past ? expected - present : "", past && expected ? Math.round((present / expected) * 100) : ""]);
    if (past && !e.excludeSeasonCards) {
      sheets.push({
        name: `${formatDay(e.startsAt).slice(0, 5).replace("/", "-")} ${e.title}`,
        rows: [["Houder", "Ticketnummer", "Bron", "Soort", "Vak", "Aanwezig", "Binnen om", "Ingang"], ...rows.sort((a, b) => Number(b.st === "ATTENDED") - Number(a.st === "ATTENDED")).map(({ h, st: s, hit }): Cell[] => [h.name, h.source === "HHC" ? h.publicId : "", sourceLabel(h), h.type, h.zone ?? "", s === "ATTENDED" ? "Ja" : "Nee", hit ? formatDayTime(hit.scannedAt) : "", (hit?.entranceId && entrances.get(hit.entranceId)) || ""])],
      });
    }
  }
  const body = await toXlsxBook([{ name: "Per houder", rows: matrix }, { name: "Per duel", rows: perEvent }, ...sheets]);
  await ticketAudit({ action: "export.created", actor: actorOf(actor), summary: "Export aanwezigheid seizoenskaarten (xlsx)", meta: { kind: "seasonpass-attendance", seasonId: season.id, personal } });
  const slug = season.name.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "seizoen";
  return { body, name: `aanwezigheid-seizoenskaarten-${slug}.xlsx` };
}

/** Gebruik van één pas (eigen of Fullhouse) per duel in het seizoen. */
export async function seasonPassDetail(actor: TicketsActor, id: string) {
  need(actor, "tickets:read");
  const personal = actor.access.can("tickets:personal");
  await seasonMaintenance();
  const now = new Date();
  const entrances = new Map((await prisma.ticketEntrance.findMany({ select: { id: true, name: true } })).map((e) => [e.id, e.name]));

  let head: { id: string; publicId: string; source: "HHC" | "FULLHOUSE"; name: string; type: string; zone: string | null; status: string };
  let card: CardRow;
  let scanWhere: Prisma.TicketScanWhereInput;
  if (id.startsWith(FH_PREFIX)) {
    const ext = await prisma.ticketExternalTicket.findUnique({ where: { id: id.slice(FH_PREFIX.length) }, select: { id: true, eventExtId: true, codeHash: true, status: true, holderLabel: true, ticketName: true, area: true, soldAt: true } });
    const source = ext ? (await seasonCardSources()).find((s) => s.externalId === ext.eventExtId) : null;
    if (!ext || !source?.seasonId) throw new ApiError(404, "Seizoenspas niet gevonden.");
    head = { id, publicId: "Fullhouse", source: "FULLHOUSE", name: ext.holderLabel || "Onbekend", type: ext.ticketName ?? "Seizoenskaart", zone: ext.area, status: ext.status === "VALID" ? "ACTIVE" : "CANCELLED" };
    card = fullhouseCardRow(ext, source.seasonId);
    scanWhere = { codeHash: ext.codeHash, ticketId: null };
  } else {
    const t = await prisma.ticket.findUnique({ where: { id }, select: { ...CARD_SELECT, anonymizedAt: true } });
    if (!t || !t.isSeasonCard) throw new ApiError(404, "Seizoenspas niet gevonden.");
    head = { id: t.id, publicId: t.publicId, source: "HHC", name: t.anonymizedAt ? "Geanonimiseerd" : personal ? `${t.firstName} ${t.lastName}` : initialsOf(t.firstName, t.lastName), type: t.type.name, zone: t.zone?.name ?? null, status: t.status };
    card = t;
    scanWhere = { ticketId: id };
  }
  const events = card.seasonId ? await seasonEvents(card.seasonId) : [];
  const scans = await prisma.ticketScan.findMany({ where: { ...scanWhere, result: "VALID" }, orderBy: { scannedAt: "asc" }, select: { eventId: true, scannedAt: true, entranceId: true } });
  return {
    ...head,
    games: events
      .map((e) => {
        const hits = scans.filter((s) => s.eventId === e.id);
        const state = gameState(card, e, hits.length > 0, now);
        if (!state) return null;
        return { id: e.id, title: e.title, startsAt: e.startsAt.toISOString(), past: e.startsAt <= now, attended: hits.length > 0, state, stateLabel: GAME_STATE_LABELS[state], firstAt: hits[0]?.scannedAt.toISOString() ?? null, entrance: (hits[0]?.entranceId && entrances.get(hits[0].entranceId)) || null, scans: hits.length };
      })
      .filter((g): g is NonNullable<typeof g> => !!g),
  };
}

// ── Verlengen naar een volgend seizoen ──

const renewSchema = z.object({ fromSeasonId: z.string().min(1), toSeasonId: z.string().min(1), ticketIds: z.array(z.string().min(1)).max(2000).optional() });

const norm = (t: { firstName: string; lastName: string; email: string | null }) => `${t.firstName}|${t.lastName}|${t.email ?? ""}`.toLowerCase();

/**
 * Nieuwe passen uitgeven voor het volgende seizoen, met dezelfde houder, type en vak. Houders die in het
 * nieuwe seizoen al een pas van dat type hebben, worden overgeslagen (veilig om opnieuw te draaien).
 * Loopt via de gewone uitgifte: boven de drempel wacht de aanvraag op goedkeuring.
 */
export async function renewSeasonPasses(actor: TicketsActor, raw: unknown) {
  need(actor, "tickets:issue");
  const input = renewSchema.parse(raw);
  if (input.fromSeasonId === input.toSeasonId) throw new ApiError(400, "Kies twee verschillende seizoenen.");
  const [from, to] = await Promise.all([prisma.ticketSeason.findUnique({ where: { id: input.fromSeasonId } }), prisma.ticketSeason.findUnique({ where: { id: input.toSeasonId } })]);
  if (!from || !to) throw new ApiError(404, "Seizoen niet gevonden.");

  const old = await prisma.ticket.findMany({
    where: { isSeasonCard: true, source: "HHC", anonymizedAt: null, status: "ACTIVE", seasonId: from.id, ...(input.ticketIds ? { id: { in: input.ticketIds } } : {}) },
    select: { typeId: true, zoneId: true, firstName: true, lastName: true, email: true, phone: true, company: true, relation: true },
  });
  const existing = await prisma.ticket.findMany({ where: { isSeasonCard: true, source: "HHC", anonymizedAt: null, seasonId: to.id, status: { not: "CANCELLED" } }, select: { typeId: true, firstName: true, lastName: true, email: true } });
  const have = new Set(existing.map((t) => `${t.typeId}|${norm(t)}`));
  // Ook houders die al in een (verlengings)aanvraag voor dit seizoen zitten die nog op goedkeuring wacht.
  const pendingBatches = await prisma.ticketBatch.findMany({ where: { status: "PENDING_APPROVAL" }, select: { payload: true } });
  for (const b of pendingBatches) {
    const p = issueSchema.safeParse(b.payload);
    if (p.success && p.data.seasonId === to.id) for (const h of p.data.holders) have.add(`${p.data.typeId}|${norm(h)}`);
  }

  const groups = new Map<string, typeof old>();
  let skipped = 0;
  for (const t of old) {
    const key = `${t.typeId}|${norm(t)}`;
    if (have.has(key)) {
      skipped++;
      continue;
    }
    have.add(key);
    const gk = `${t.typeId}|${t.zoneId ?? ""}`;
    groups.set(gk, [...(groups.get(gk) ?? []), t]);
  }

  let created = 0;
  let pending = 0;
  for (const [gk, list] of groups) {
    const [typeId, zoneId] = gk.split("|");
    const holders = list.map((t) => holderSchema.parse({ firstName: t.firstName, lastName: t.lastName, email: t.email ?? "", phone: t.phone ?? "", company: t.company ?? "", relation: t.relation ?? "", note: "" }));
    const r = (await issueTickets(actor, { typeId, zoneId: zoneId || null, seasonId: to.id, eventIds: [], holders, batchName: `Verlenging ${from.name} → ${to.name}` })) as { pendingApproval: boolean; count: number };
    if (r.pendingApproval) pending += r.count;
    else created += r.count;
  }
  return { created, pendingApproval: pending, skipped, total: old.length };
}

// ── Overdragen aan een andere houder ──

const transferSchema = z.object({
  holder: holderSchema,
  reason: z.string().trim().min(3, "Geef een reden op (minstens 3 tekens).").max(500),
});

/**
 * Een ticket op naam van iemand anders zetten. De QR en de ticketlink krijgen een nieuwe versie, zodat de
 * oude houder niet meer binnenkomt. Het gebruik tot nu toe blijft bij het ticket. In het auditlog staan
 * geen namen, alleen dat het is overgedragen en waarom.
 */
export async function transferTicket(actor: TicketsActor, id: string, raw: unknown) {
  need(actor, "tickets:issue");
  need(actor, "tickets:resend");
  const input = transferSchema.parse(raw);
  const h = input.holder;
  return prisma.$transaction(async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id }, select: { status: true, anonymizedAt: true, source: true } });
    if (!t || t.source !== "HHC") throw new ApiError(404, "Ticket niet gevonden.");
    if (t.anonymizedAt) throw new ApiError(400, "Een geanonimiseerd ticket kan niet worden overgedragen.");
    if (t.status !== "ACTIVE") throw new ApiError(400, "Alleen actieve tickets kunnen worden overgedragen.");
    const row = await tx.ticket.update({
      where: { id },
      data: { firstName: h.firstName, lastName: h.lastName, email: h.email, phone: h.phone, company: h.company, relation: h.relation, note: h.note, photoKey: null, qrVersion: { increment: 1 }, linkVersion: { increment: 1 } },
      select: { qrVersion: true, linkVersion: true },
    });
    await ticketAuditTx(tx, { action: "ticket.transferred", actor: actorOf(actor), ticketId: id, reason: input.reason, summary: "Ticket overgedragen aan een andere houder", meta: { qrVersion: row.qrVersion } });
    return { ok: true, hasEmail: !!h.email };
  });
}
