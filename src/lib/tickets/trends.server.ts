import { prisma } from "@/lib/prisma";
import { need, type TicketsActor } from "./authz.server";
import { coversEvent, type RuleTicket, type ValidityMode } from "./rules";

// Trends per seizoen: opkomst per duel, verkocht/uitgegeven tegenover gescand, en vergelijking tussen duels
// en seizoenen. Alleen aantallen, zonder persoonsgegevens en zonder rapportagemails.

export interface TrendGame {
  id: string;
  title: string;
  startsAt: string;
  isHome: boolean;
  competition: string | null;
  past: boolean;
  hhcSold: number;
  fullhouseSold: number;
  sold: number;
  admitted: number;
  /** Opkomst in procenten van verkocht/uitgegeven; null zolang er niets is uitgegeven. */
  pct: number | null;
  /** Verschil met het gemiddelde aantal bezoekers van de gespeelde duels in dit seizoen. */
  deltaToAverage: number | null;
}

export interface TrendSummary {
  games: number;
  pastGames: number;
  totalAdmitted: number;
  averageAdmitted: number | null;
  averagePct: number | null;
  bestId: string | null;
  worstId: string | null;
}

/** Puur: samenvatting van de gespeelde duels (met minstens één bezoeker of uitgegeven ticket). Testbaar zonder database. */
export function summarize(games: Omit<TrendGame, "deltaToAverage">[]): { games: TrendGame[]; summary: TrendSummary } {
  const played = games.filter((g) => g.past && (g.sold > 0 || g.admitted > 0));
  const totalAdmitted = played.reduce((n, g) => n + g.admitted, 0);
  const averageAdmitted = played.length ? Math.round(totalAdmitted / played.length) : null;
  const withPct = played.filter((g) => g.pct != null);
  const averagePct = withPct.length ? Math.round(withPct.reduce((n, g) => n + g.pct!, 0) / withPct.length) : null;
  const byAdmitted = [...played].sort((a, b) => b.admitted - a.admitted);
  return {
    games: games.map((g) => ({ ...g, deltaToAverage: g.past && averageAdmitted != null && (g.sold > 0 || g.admitted > 0) ? g.admitted - averageAdmitted : null })),
    summary: { games: games.length, pastGames: played.length, totalAdmitted, averageAdmitted, averagePct, bestId: byAdmitted[0]?.id ?? null, worstId: byAdmitted.length > 1 ? byAdmitted[byAdmitted.length - 1].id : null },
  };
}

export const pctOf = (admitted: number, sold: number): number | null => (sold > 0 ? Math.min(100, Math.round((admitted / sold) * 100)) : null);

export async function seasonTrends(actor: TicketsActor, seasonId?: string) {
  need(actor, "reports:read");
  const now = new Date();
  const seasons = await prisma.ticketSeason.findMany({ orderBy: { startsOn: "desc" }, take: 6 });
  if (seasons.length === 0) return { seasons: [], season: null, games: [] as TrendGame[], summary: null, compare: [] as never[] };
  const current = seasons.find((s) => s.id === seasonId) ?? seasons.find((s) => s.startsOn <= now && s.endsOn >= now) ?? seasons[0];

  const events = await prisma.ticketEvent.findMany({ where: { seasonId: { in: seasons.map((s) => s.id) }, status: { not: "CANCELLED" } }, orderBy: { startsAt: "asc" }, select: { id: true, title: true, startsAt: true, endsAt: true, status: true, seasonId: true, competition: true, isHome: true, allowReentry: true, externalId: true } });
  const ids = events.map((e) => e.id);
  const [tickets, scans, external] = await Promise.all([
    // Ook verlopen tickets tellen mee voor wat er toen verkocht of uitgegeven was; alleen ingetrokken tickets niet.
    prisma.ticket.findMany({ where: { status: { not: "CANCELLED" }, source: "HHC" }, select: { id: true, validityMode: true, validFrom: true, validUntil: true, seasonId: true, competitions: true, homeOnly: true, isSeasonCard: true, zoneId: true, links: { select: { eventId: true } } } }),
    ids.length ? prisma.ticketScan.findMany({ where: { eventId: { in: ids }, result: "VALID" }, distinct: ["eventId", "ticketId", "codeHash"], select: { eventId: true, source: true } }) : [],
    prisma.ticketExternalTicket.groupBy({ by: ["eventExtId"], where: { status: "VALID", eventExtId: { in: events.map((e) => e.externalId).filter(Boolean) as string[] } }, _count: { _all: true } }),
  ]);
  const ruleTickets: RuleTicket[] = tickets.map((t) => ({ status: "ACTIVE", validityMode: t.validityMode as ValidityMode, validFrom: t.validFrom, validUntil: t.validUntil, seasonId: t.seasonId, competitions: t.competitions, eventIds: t.links.map((l) => l.eventId), homeOnly: t.homeOnly, isSeasonCard: t.isSeasonCard, zoneId: t.zoneId }));
  const admittedBy = new Map<string, number>();
  for (const s of scans) admittedBy.set(s.eventId, (admittedBy.get(s.eventId) ?? 0) + 1);
  const fhSold = new Map(external.map((x) => [x.eventExtId, x._count._all]));

  const raw = events.map((e) => {
    const re = { id: e.id, status: e.status as "ACTIVE", seasonId: e.seasonId, competition: e.competition, isHome: e.isHome, startsAt: e.startsAt, endsAt: e.endsAt, allowReentry: e.allowReentry };
    const hhcSold = ruleTickets.reduce((n, t) => n + (coversEvent(t, re) ? 1 : 0), 0);
    const fullhouseSold = e.externalId ? fhSold.get(e.externalId) ?? 0 : 0;
    const sold = hhcSold + fullhouseSold;
    const admitted = admittedBy.get(e.id) ?? 0;
    return { seasonId: e.seasonId, game: { id: e.id, title: e.title, startsAt: e.startsAt.toISOString(), isHome: e.isHome, competition: e.competition, past: e.startsAt <= now, hhcSold, fullhouseSold, sold, admitted, pct: pctOf(admitted, sold) } };
  });

  const compare = seasons.map((s) => {
    const r = summarize(raw.filter((x) => x.seasonId === s.id).map((x) => x.game));
    return { id: s.id, name: s.name, ...r.summary };
  });
  const detail = summarize(raw.filter((x) => x.seasonId === current.id).map((x) => x.game));
  return { seasons: seasons.map((s) => ({ id: s.id, name: s.name })), season: { id: current.id, name: current.name }, games: detail.games, summary: detail.summary, compare };
}
