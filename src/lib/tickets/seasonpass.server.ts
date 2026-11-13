import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAuditTx } from "./audit.server";
import { need, type TicketsActor } from "./authz.server";
import { initialsOf } from "./issue";
import { coversEvent, type RuleEvent, type RuleTicket, type TicketStatus, type ValidityMode } from "./rules";
import { holderSchema } from "./schemas";
import { issueTickets } from "./tickets.server";
import { z } from "zod";

// Seizoenspassen: gebruik per houder en duel, no-show-overzicht, verlengen naar een volgend seizoen
// en overdragen aan een andere houder.

const actorOf = (a: TicketsActor) => ({ id: a.id, name: a.name });
const CARD_SELECT = { id: true, publicId: true, firstName: true, lastName: true, typeId: true, zoneId: true, status: true, validityMode: true, validFrom: true, validUntil: true, seasonId: true, competitions: true, homeOnly: true, isSeasonCard: true, type: { select: { name: true } }, zone: { select: { name: true } } } as const;

type EventRow = { id: string; title: string; startsAt: Date; endsAt: Date; status: string; seasonId: string | null; competition: string | null; isHome: boolean; allowReentry: boolean };
type CardRow = { id: string; status: string; validityMode: string; validFrom: Date | null; validUntil: Date | null; seasonId: string | null; competitions: string[]; homeOnly: boolean; isSeasonCard: boolean; zoneId: string | null };

const ruleEvent = (e: EventRow): RuleEvent => ({ id: e.id, status: e.status as RuleEvent["status"], seasonId: e.seasonId, competition: e.competition, isHome: e.isHome, startsAt: e.startsAt, endsAt: e.endsAt, allowReentry: e.allowReentry });
const ruleTicket = (t: CardRow): RuleTicket => ({ status: t.status as TicketStatus, validityMode: t.validityMode as ValidityMode, validFrom: t.validFrom, validUntil: t.validUntil, seasonId: t.seasonId, competitions: t.competitions, eventIds: [], homeOnly: t.homeOnly, isSeasonCard: t.isSeasonCard, zoneId: t.zoneId });

/** Duels waar deze pas voor geldt (zonder afgelaste), op volgorde van aftrap. Puur, dus testbaar. */
export function eligibleEvents(card: CardRow, events: EventRow[]): EventRow[] {
  const rt = ruleTicket(card);
  return events.filter((e) => e.status !== "CANCELLED" && coversEvent(rt, ruleEvent(e))).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
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

export async function seasonPassOverview(actor: TicketsActor, opts: { seasonId?: string; q?: string; filter?: PassFilter }) {
  need(actor, "tickets:read");
  const personal = actor.access.can("tickets:personal");
  const now = new Date();
  const seasons = await prisma.ticketSeason.findMany({ orderBy: { startsOn: "desc" } });
  const season = seasons.find((s) => s.id === opts.seasonId) ?? seasons.find((s) => s.startsOn <= now && s.endsOn >= now) ?? seasons[0] ?? null;
  if (!season) return { seasons, season: null, summary: null, rows: [] as never[], personal };

  const [events, cards] = await Promise.all([
    prisma.ticketEvent.findMany({ where: { seasonId: season.id, status: { not: "CANCELLED" } }, select: { id: true, title: true, startsAt: true, endsAt: true, status: true, seasonId: true, competition: true, isHome: true, allowReentry: true } }),
    prisma.ticket.findMany({ where: { isSeasonCard: true, source: "HHC", anonymizedAt: null, status: "ACTIVE", seasonId: season.id }, orderBy: { lastName: "asc" }, select: CARD_SELECT }),
  ]);
  const pastIds = events.filter((e) => e.startsAt <= now).map((e) => e.id);
  const scans = cards.length && pastIds.length
    ? await prisma.ticketScan.findMany({ where: { ticketId: { in: cards.map((c) => c.id) }, eventId: { in: pastIds }, result: "VALID" }, select: { ticketId: true, eventId: true, scannedAt: true } })
    : [];
  const attendedBy = new Map<string, Set<string>>();
  const lastBy = new Map<string, Date>();
  for (const s of scans) {
    if (!s.ticketId) continue;
    (attendedBy.get(s.ticketId) ?? attendedBy.set(s.ticketId, new Set()).get(s.ticketId)!).add(s.eventId);
    if (!lastBy.get(s.ticketId) || s.scannedAt > lastBy.get(s.ticketId)!) lastBy.set(s.ticketId, s.scannedAt);
  }

  const q = opts.q?.trim().toLowerCase();
  let rows = cards.map((c) => {
    const past = eligibleEvents(c, events.filter((e) => e.startsAt <= now));
    const attended = attendedBy.get(c.id) ?? new Set<string>();
    const came = past.filter((e) => attended.has(e.id)).length;
    return {
      id: c.id,
      publicId: c.publicId,
      name: personal ? `${c.firstName} ${c.lastName}` : initialsOf(c.firstName, c.lastName),
      type: c.type.name,
      zone: c.zone?.name ?? null,
      eligible: past.length,
      attended: came,
      streak: missedStreak(past.map((e) => e.id), attended),
      lastSeen: lastBy.get(c.id)?.toISOString() ?? null,
    };
  });
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.publicId.toLowerCase().startsWith(q));
  const withGames = rows.filter((r) => r.eligible > 0);
  const summary = {
    passes: rows.length,
    pastGames: events.filter((e) => e.startsAt <= now).length,
    upcomingGames: events.filter((e) => e.startsAt > now).length,
    averagePct: withGames.length ? Math.round((withGames.reduce((n, r) => n + r.attended / r.eligible, 0) / withGames.length) * 100) : null,
    noShow: rows.filter((r) => r.eligible >= 2 && r.attended === 0).length,
    streak3: rows.filter((r) => r.streak >= 3).length,
  };
  if (opts.filter === "noshow") rows = rows.filter((r) => r.eligible >= 2 && r.attended === 0);
  if (opts.filter === "streak") rows = rows.filter((r) => r.streak >= 3);
  rows.sort((a, b) => (opts.filter ? b.streak - a.streak : 0) || a.name.localeCompare(b.name, "nl"));
  return { seasons, season: { id: season.id, name: season.name }, summary, rows: rows.slice(0, 500), personal };
}

/** Gebruik van één pas per duel in het seizoen. */
export async function seasonPassDetail(actor: TicketsActor, id: string) {
  need(actor, "tickets:read");
  const personal = actor.access.can("tickets:personal");
  const card = await prisma.ticket.findUnique({ where: { id }, select: { ...CARD_SELECT, anonymizedAt: true } });
  if (!card || !card.isSeasonCard) throw new ApiError(404, "Seizoenspas niet gevonden.");
  const events = card.seasonId
    ? await prisma.ticketEvent.findMany({ where: { seasonId: card.seasonId, status: { not: "CANCELLED" } }, select: { id: true, title: true, startsAt: true, endsAt: true, status: true, seasonId: true, competition: true, isHome: true, allowReentry: true } })
    : [];
  const scans = await prisma.ticketScan.findMany({ where: { ticketId: id, result: "VALID" }, orderBy: { scannedAt: "asc" }, select: { eventId: true, scannedAt: true, entranceId: true } });
  const entrances = new Map((await prisma.ticketEntrance.findMany({ select: { id: true, name: true } })).map((e) => [e.id, e.name]));
  const now = new Date();
  return {
    id: card.id,
    publicId: card.publicId,
    name: card.anonymizedAt ? "Geanonimiseerd" : personal ? `${card.firstName} ${card.lastName}` : initialsOf(card.firstName, card.lastName),
    type: card.type.name,
    zone: card.zone?.name ?? null,
    status: card.status,
    games: eligibleEvents(card, events).map((e) => {
      const hits = scans.filter((s) => s.eventId === e.id);
      return { id: e.id, title: e.title, startsAt: e.startsAt.toISOString(), past: e.startsAt <= now, attended: hits.length > 0, firstAt: hits[0]?.scannedAt.toISOString() ?? null, entrance: (hits[0]?.entranceId && entrances.get(hits[0].entranceId)) || null };
    }),
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
      data: { firstName: h.firstName, lastName: h.lastName, email: h.email, phone: h.phone, company: h.company, relation: h.relation, qrVersion: { increment: 1 }, linkVersion: { increment: 1 } },
      select: { qrVersion: true, linkVersion: true },
    });
    await ticketAuditTx(tx, { action: "ticket.transferred", actor: actorOf(actor), ticketId: id, reason: input.reason, summary: "Ticket overgedragen aan een andere houder", meta: { qrVersion: row.qrVersion } });
    return { ok: true, hasEmail: !!h.email };
  });
}
