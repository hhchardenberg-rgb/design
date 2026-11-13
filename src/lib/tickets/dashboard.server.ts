import { prisma } from "@/lib/prisma";
import { TICKET_CATEGORY_KEYS } from "./rules";

// Basisdashboard (fase 1). Scans, aanwezigen en Fullhouse-aantallen komen erbij in fase 3 en 4;
// het dashboard toont daarvoor al de plek, zodat het één product blijft.

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
      where: { endsAt: { gte: now }, status: { in: ["DRAFT", "ACTIVE"] } },
      orderBy: { startsAt: "asc" },
      take: 5,
      include: { _count: { select: { links: { where: { ticket: { status: "ACTIVE" } } } } } },
    }),
    prisma.ticketBatch.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.ticket.count({ where: { ...active, isSeasonCard: true } }),
  ]);
  const cat = new Map(byCategory.map((r) => [r.category, r._count._all]));
  return {
    tickets: { active: activeCount, blocked, cancelled, expired, seasonCards },
    byCategory: TICKET_CATEGORY_KEYS.map((k) => ({ category: k, count: cat.get(k) ?? 0 })).filter((r) => r.count > 0),
    upcoming: upcoming.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, status: e.status, allowReentry: e.allowReentry, singleTickets: e._count.links })),
    pendingBatches,
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
