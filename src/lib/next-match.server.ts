import "server-only";
import { prisma } from "@/lib/prisma";
import { fetchUpcomingCalendarEvents, type CalendarEvent } from "@/lib/calendar";
import type { NextMatch } from "@/components/shell/types";

/**
 * Eerstvolgende wedstrijden voor de wedstrijdband en -chip.
 *
 * Wedstrijden staan op drie plekken: de wedstrijden van de designtool (Beheer > Wedstrijden),
 * de wedstrijden van Tickets en de clubagenda (Google Agenda, met de KNVB-koppeling).
 * Alleen de designtool-tabel gebruiken gaf "geen wedstrijd gepland" terwijl de agenda vol stond.
 * We voegen ze samen; staan er twee binnen drie uur van elkaar, dan is het dezelfde wedstrijd en
 * houden we de designtool-versie (die kan de templates direct vullen).
 */

const CLUB = /hardenberg|\bhhc\b/i;
const SAME_MATCH_MS = 3 * 3600_000;

// Lichte cache: de agenda wordt bij elke paginawissel in de kopbalk gebruikt.
let icsCache: { at: number; events: CalendarEvent[] } | null = null;
async function calendarEvents(from: Date): Promise<CalendarEvent[]> {
  if (icsCache && Date.now() - icsCache.at < 10 * 60_000) return icsCache.events;
  const events = await fetchUpcomingCalendarEvents({ from, to: new Date(from.getTime() + 120 * 86_400_000) });
  icsCache = { at: Date.now(), events };
  return events;
}

/** "HHC Hardenberg - Spakenburg" → thuis/uit. Alleen als één kant de club is. */
export function parseMatchTitle(title: string): { home: string; away: string; isHome: boolean } | null {
  const parts = title.split(/\s+[-–—]\s+|\s+vs\.?\s+/i).map((x) => x.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (CLUB.test(a) === CLUB.test(b)) return null;
  return { home: a, away: b, isHome: CLUB.test(a) };
}

type Candidate = NextMatch & { rank: number };

export async function loadUpcomingMatches(opts: { from: Date; to?: Date; take?: number }): Promise<NextMatch[]> {
  const { from } = opts;
  const to = opts.to ?? new Date(from.getTime() + 365 * 86_400_000);

  const [designMatches, ticketEvents, ics] = await Promise.all([
    prisma.match
      .findMany({ where: { date: { gte: from, lte: to }, status: { not: "CANCELLED" } }, orderBy: { date: "asc" }, take: 50, include: { team: true, opponent: true } })
      .catch(() => []),
    prisma.ticketEvent
      .findMany({ where: { startsAt: { gte: from, lte: to }, archivedAt: null, visible: true, status: { not: "CANCELLED" } }, orderBy: { startsAt: "asc" }, take: 50 })
      .catch(() => []),
    calendarEvents(from).catch(() => [] as CalendarEvent[]),
  ]);

  const list: Candidate[] = [];
  for (const m of designMatches) {
    const club = m.team.shortName ?? m.team.name;
    const opp = m.opponent.shortName ?? m.opponent.name;
    list.push({ rank: 0, id: m.id, designMatchId: m.id, home: m.isHome ? club : opp, away: m.isHome ? opp : club, isHome: m.isHome, date: m.date.toISOString(), competition: m.competition });
  }
  for (const e of ticketEvents) {
    const parsed = parseMatchTitle(e.title);
    const home = parsed?.home ?? (e.isHome ? "HHC Hardenberg" : e.opponent ?? e.title);
    const away = parsed?.away ?? (e.isHome ? e.opponent ?? e.title : "HHC Hardenberg");
    list.push({ rank: 1, id: `t-${e.id}`, designMatchId: e.matchId, home, away, isHome: parsed?.isHome ?? e.isHome, date: e.startsAt.toISOString(), competition: e.competition });
  }
  for (const e of ics) {
    if (e.start < from || e.start > to) continue;
    const parsed = parseMatchTitle(e.title);
    if (!parsed) continue;
    list.push({ rank: 2, id: `a-${e.id}`, designMatchId: null, ...parsed, date: e.start.toISOString(), competition: e.competition ?? null });
  }

  list.sort((a, b) => a.date.localeCompare(b.date) || a.rank - b.rank);
  const out: NextMatch[] = [];
  for (const c of list) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(new Date(prev.date).getTime() - new Date(c.date).getTime()) < SAME_MATCH_MS) {
      // Zelfde wedstrijd uit een andere bron: vul ontbrekende gegevens aan.
      if (!prev.competition && c.competition) prev.competition = c.competition;
      if (!prev.designMatchId && c.designMatchId) prev.designMatchId = c.designMatchId;
      continue;
    }
    const { rank: _rank, ...m } = c;
    void _rank;
    out.push(m);
    if (opts.take && out.length >= opts.take) break;
  }
  return out;
}

export async function loadNextMatch(): Promise<NextMatch | null> {
  const [m] = await loadUpcomingMatches({ from: new Date(Date.now() - 2 * 3600_000), take: 1 });
  return m ?? null;
}
