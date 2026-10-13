import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { need, type RecordCtx } from "./ctx.server";

// Toezicht voor beheerders van Commerciële Zaken (recht 'rights:manage_rights': hoofdadmin en
// Beheerder Commerciële Zaken). Bewust niet beperkt door het eigen recordbereik: wie bereik en rechten
// toekent, moet kunnen zien wat er per persoon speelt. Bedragen komen hier nergens in voor.

const guard = (ctx: RecordCtx) => need(ctx, "rights:manage_rights");

export interface AuditQuery {
  actorId?: string;
  /** Alleen acties die met dit voorvoegsel beginnen, bijvoorbeeld "invoice." of "mailing". */
  actionPrefix?: string;
  from?: string;
  to?: string;
  page?: number;
}
const AUDIT_PAGE = 50;

function parseDay(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, "Gebruik een datum in de vorm JJJJ-MM-DD.");
  const d = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, "Ongeldige datum.");
  return d;
}

export async function listAuditLog(ctx: RecordCtx, q: AuditQuery) {
  guard(ctx);
  const from = parseDay(q.from, false);
  const to = parseDay(q.to, true);
  const where = {
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.actionPrefix ? { action: { startsWith: q.actionPrefix.slice(0, 40) } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
  const page = Math.max(q.page ?? 1, 1);
  const [total, rows] = await Promise.all([
    prisma.commercialAuditEvent.count({ where }),
    prisma.commercialAuditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * AUDIT_PAGE, take: AUDIT_PAGE }),
  ]);
  const targetIds = [...new Set(rows.map((r) => r.targetUserId).filter((x): x is string => !!x))];
  const targets = new Map((await prisma.user.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return {
    total,
    page,
    pageSize: AUDIT_PAGE,
    rows: rows.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      actorId: r.actorId,
      actor: r.actorLabel,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      targetName: r.targetUserId ? (targets.get(r.targetUserId) ?? null) : null,
      before: r.before,
      after: r.after,
    })),
  };
}

/** Personen waar het logboek en het overzicht over gaan: leden van de sectie en iedereen die in het logboek voorkomt. */
export async function listPeople(ctx: RecordCtx) {
  guard(ctx);
  const [members, admins, actors] = await Promise.all([
    prisma.commercialMembership.findMany({ select: { userId: true } }),
    prisma.user.findMany({ where: { roles: { has: "ADMIN" } }, select: { id: true } }),
    prisma.commercialAuditEvent.findMany({ where: { actorId: { not: null } }, distinct: ["actorId"], select: { actorId: true } }),
  ]);
  const ids = [...new Set([...members.map((m) => m.userId), ...admins.map((a) => a.id), ...actors.map((a) => a.actorId!).filter(Boolean)])];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } });
  const now = new Date();
  const [open, overdue, opps, companies] = await Promise.all([
    prisma.commercialTask.groupBy({ by: ["assigneeId"], where: { status: "OPEN", assigneeId: { in: ids } }, _count: { _all: true } }),
    prisma.commercialTask.groupBy({ by: ["assigneeId"], where: { status: "OPEN", dueAt: { lt: now }, assigneeId: { in: ids } }, _count: { _all: true } }),
    prisma.commercialOpportunity.groupBy({ by: ["ownerId"], where: { archivedAt: null, stage: { notIn: ["WON", "LOST"] }, ownerId: { in: ids } }, _count: { _all: true } }),
    prisma.commercialCompany.groupBy({ by: ["ownerId"], where: { archivedAt: null, ownerId: { in: ids } }, _count: { _all: true } }),
  ]);
  const count = (rows: { _count: { _all: number } }[] & { assigneeId?: string | null; ownerId?: string | null }[], id: string) =>
    (rows as { assigneeId?: string | null; ownerId?: string | null; _count: { _all: number } }[]).find((r) => (r.assigneeId ?? r.ownerId) === id)?._count._all ?? 0;
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    openTasks: count(open, u.id),
    overdueTasks: count(overdue, u.id),
    openOpportunities: count(opps, u.id),
    companies: count(companies, u.id),
  }));
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Alles wat voor één persoon openstaat, plus de laatste handelingen van die persoon. */
export async function personOverview(ctx: RecordCtx, userId: string) {
  guard(ctx);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (!user) throw new ApiError(404, "Persoon niet gevonden.");
  const [tasks, opps, counterparts, companies, activity] = await Promise.all([
    prisma.commercialTask.findMany({ where: { assigneeId: userId, status: "OPEN" }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }], take: 100, include: { company: { select: { id: true, name: true } } } }),
    prisma.commercialOpportunity.findMany({ where: { ownerId: userId, archivedAt: null, stage: { notIn: ["WON", "LOST"] } }, orderBy: [{ expectedCloseOn: { sort: "asc", nulls: "last" } }], take: 100, include: { company: { select: { id: true, name: true } } } }),
    prisma.commercialCounterpart.findMany({ where: { responsibleId: userId, status: { in: ["PLANNED", "IN_PROGRESS"] } }, orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }], take: 100 }),
    prisma.commercialCompany.findMany({ where: { ownerId: userId, archivedAt: null }, orderBy: { name: "asc" }, take: 100, select: { id: true, name: true, status: true } }),
    prisma.commercialAuditEvent.findMany({ where: { actorId: userId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, createdAt: true, action: true, entity: true } }),
  ]);
  const now = Date.now();
  const cpCompanies = new Map((await prisma.commercialCompany.findMany({ where: { id: { in: counterparts.map((c) => c.companyId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  return {
    user,
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, dueAt: iso(t.dueAt), overdue: !!t.dueAt && t.dueAt.getTime() < now, priority: t.priority, companyId: t.company?.id ?? null, companyName: t.company?.name ?? null })),
    opportunities: opps.map((o) => ({ id: o.id, title: o.title, stage: o.stage, expectedCloseOn: o.expectedCloseOn ? o.expectedCloseOn.toISOString().slice(0, 10) : null, companyId: o.company.id, companyName: o.company.name })),
    counterparts: counterparts.map((c) => ({ id: c.id, title: c.title, status: c.status, dueOn: c.dueOn ? c.dueOn.toISOString().slice(0, 10) : null, companyId: c.companyId, companyName: cpCompanies.get(c.companyId) ?? "" })),
    companies,
    activity: activity.map((a) => ({ id: a.id, at: a.createdAt.toISOString(), action: a.action, entity: a.entity })),
  };
}
