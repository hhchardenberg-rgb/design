import { prisma } from "@/lib/prisma";
import { TICKET_CATEGORY_KEYS } from "./rules";

// Dashboard van HHC Tickets: eigen tickets, Fullhouse-tickets en de scans van de wedstrijd die nu
// bezig is (of anders de eerstvolgende / de laatst gespeelde).

export async function dashboardData() {
  const now = new Date();
  const active = { status: "ACTIVE", OR: [{ validUntil: null }, { validUntil: { gte: now } }] };
  const [activeCount, blocked, cancelled, expired, byCategory, upcoming, pendingBatches, seasonCards] = await Promise.all([
    prisma.ticket.count({ where: active }),
    prisma.ticket.count({ where: { status: "BLOCKED" } }),
    prisma.ticket.count({ where: { status: "CANCELLED" } }),
    prisma.ticket.count({ where: { status: "ACTIVE", validUntil: { lt: now } } }),
    prisma.ticket.groupBy({ by: ["category"], where: active, _count: { _all: true } }),
    prisma.ticketEvent.findMany({
      where: { archivedAt: null, endsAt: { gte: now }, status: { in: ["DRAFT", "ACTIVE"] } },
      orderBy: { startsAt: "asc" },
      take: 5,
      include: { _count: { select: { links: { where: { ticket: { status: "ACTIVE" } } } } } },
    }),
    prisma.ticketBatch.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.ticket.count({ where: { ...active, isSeasonCard: true } }),
  ]);
  const cat = new Map(byCategory.map((r) => [r.category, r._count._all]));
  const extIds = upcoming.map((e) => e.externalId).filter((x): x is string => !!x);
  const [fhCounts, focus] = await Promise.all([
    extIds.length ? prisma.ticketExternalTicket.groupBy({ by: ["eventExtId"], where: { eventExtId: { in: extIds }, status: "VALID" }, _count: { _all: true } }) : Promise.resolve([]),
    focusEvent(now),
  ]);
  const fh = new Map(fhCounts.map((c) => [c.eventExtId, c._count._all]));
  return {
    tickets: { active: activeCount, blocked, cancelled, expired, seasonCards },
    byCategory: TICKET_CATEGORY_KEYS.map((k) => ({ category: k, count: cat.get(k) ?? 0 })).filter((r) => r.count > 0),
    upcoming: upcoming.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, status: e.status, allowReentry: e.allowReentry, singleTickets: e._count.links, fullhouseTickets: e.externalId ? (fh.get(e.externalId) ?? 0) : null })),
    fullhouseUpcoming: [...fh.values()].reduce((a, b) => a + b, 0),
    focus,
    pendingBatches,
  };
}

/** De wedstrijd die nu loopt, anders de eerstvolgende binnen 14 dagen, anders de laatst gespeelde; met scancijfers. */
async function focusEvent(now: Date) {
  const t = now.getTime();
  const rows = await prisma.ticketEvent.findMany({
    where: { archivedAt: null, status: { not: "CANCELLED" }, startsAt: { lte: new Date(t + 14 * 86_400_000) }, endsAt: { gte: new Date(t - 14 * 86_400_000) } },
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true, startsAt: true, endsAt: true, externalId: true, capacity: true },
  });
  const live = rows.find((e) => e.startsAt.getTime() - 3 * 3600_000 <= t && e.endsAt.getTime() + 3 * 3600_000 >= t);
  const next = rows.find((e) => e.startsAt.getTime() > t);
  const ev = live ?? next ?? rows[rows.length - 1];
  if (!ev) return null;
  const [byResult, admitted, byEntrance, entrances, fullhouse] = await Promise.all([
    prisma.ticketScan.groupBy({ by: ["result"], where: { eventId: ev.id }, _count: { _all: true } }),
    prisma.ticketScan.findMany({ where: { eventId: ev.id, result: "VALID", reentry: false }, select: { ticketId: true, codeHash: true }, distinct: ["ticketId", "codeHash"] }),
    prisma.ticketScan.groupBy({ by: ["entranceId"], where: { eventId: ev.id, result: "VALID" }, _count: { _all: true } }),
    prisma.ticketEntrance.findMany({ select: { id: true, name: true } }),
    ev.externalId ? prisma.ticketExternalTicket.count({ where: { eventExtId: ev.externalId, status: "VALID" } }) : Promise.resolve(null),
  ]);
  const count = (r: string) => byResult.find((x) => x.result === r)?._count._all ?? 0;
  const names = new Map(entrances.map((e) => [e.id, e.name]));
  return {
    id: ev.id,
    title: ev.title,
    startsAt: ev.startsAt,
    live: !!live,
    inside: admitted.length,
    capacity: ev.capacity,
    warnings: count("WARNING"),
    invalid: count("INVALID"),
    fullhouse,
    byEntrance: byEntrance.map((e) => ({ name: (e.entranceId && names.get(e.entranceId)) || "Zonder ingang", count: e._count._all })).sort((a, b) => b.count - a.count),
  };
}

export async function auditPage(opts: { action?: string; ticketId?: string; page?: number }) {
  const where = { ...(opts.action ? { action: opts.action } : {}), ...(opts.ticketId ? { ticketId: opts.ticketId } : {}) };
  const page = Math.max(1, opts.page ?? 1);
  const [total, rows] = await Promise.all([
    prisma.ticketAuditEvent.count({ where }),
    prisma.ticketAuditEvent.findMany({ where, orderBy: { at: "desc" }, skip: (page - 1) * 100, take: 100 }),
  ]);
  return { total, page, rows };
}
