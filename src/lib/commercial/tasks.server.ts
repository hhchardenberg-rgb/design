import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { need, notFound, type RecordCtx } from "./ctx.server";
import { visibleCompany } from "./companies.server";
import { canSeeOwned, canSeeTask, taskScopeWhere } from "./scope";

export interface TaskFields {
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  dueAt?: Date | null;
  priority?: "LOW" | "NORMAL" | "HIGH";
  companyId?: string | null;
}

async function assertAssignee(ctx: RecordCtx, assigneeId: string) {
  const member = await prisma.commercialMembership.findUnique({ where: { userId: assigneeId } });
  if (!member) throw new ApiError(400, "Je kunt een taak alleen toewijzen aan iemand met toegang tot Commerciële Zaken.");
  const scope = ctx.scope("tasks");
  if (scope === "OWN" && assigneeId !== ctx.userId) throw new ApiError(403, "Met jouw bereik kun je taken alleen aan jezelf toewijzen.");
  if (scope === "TEAM" && assigneeId !== ctx.userId) {
    const shared = await prisma.commercialTeamMember.count({ where: { userId: assigneeId, teamId: { in: [...ctx.viewer.teamIds] } } });
    if (shared === 0) throw new ApiError(403, "Met jouw bereik kun je taken alleen aan jezelf of aan je teamgenoten toewijzen.");
  }
}

async function visibleTask(ctx: RecordCtx, id: string) {
  const task = await prisma.commercialTask.findUnique({ where: { id } });
  if (!task || !canSeeTask(ctx.scope("tasks"), task, ctx.viewer)) notFound("Taak");
  return task;
}

export interface TaskListQuery {
  mine?: boolean;
  status?: "OPEN" | "DONE";
  overdue?: boolean;
  companyId?: string;
  page?: number;
  pageSize?: number;
}

export async function listTasks(ctx: RecordCtx, query: TaskListQuery) {
  need(ctx, "tasks:read");
  if (query.companyId) await visibleCompany(ctx, query.companyId);
  const where: Prisma.CommercialTaskWhereInput = {
    AND: [
      taskScopeWhere(ctx.scope("tasks"), ctx.viewer),
      query.mine ? { assigneeId: ctx.userId } : {},
      query.status ? { status: query.status } : {},
      query.overdue ? { status: "OPEN", dueAt: { lt: new Date() } } : {},
      query.companyId ? { companyId: query.companyId } : {},
    ],
  };
  const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const [total, rows] = await Promise.all([
    prisma.commercialTask.count({ where }),
    prisma.commercialTask.findMany({ where, orderBy: [{ status: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);

  // Bedrijfsnaam alleen tonen als het dossier binnen het eigen bereik valt.
  const companyIds = [...new Set(rows.map((r) => r.companyId).filter((x): x is string => !!x))];
  const companies = ctx.can("companies:read") ? await prisma.commercialCompany.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true, ownerId: true, teamId: true } }) : [];
  const visibleName = new Map(companies.filter((c) => canSeeOwned(ctx.scope("companies"), c, ctx.viewer)).map((c) => [c.id, c.name]));
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.assigneeId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const uname = new Map(users.map((u) => [u.id, u.name]));
  return {
    total,
    page,
    pageSize,
    rows: rows.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueAt: t.dueAt?.toISOString() ?? null,
      assigneeId: t.assigneeId,
      assigneeName: t.assigneeId ? (uname.get(t.assigneeId) ?? null) : null,
      companyId: t.companyId && visibleName.has(t.companyId) ? t.companyId : null,
      companyName: t.companyId ? (visibleName.get(t.companyId) ?? null) : null,
      completedAt: t.completedAt?.toISOString() ?? null,
      version: t.version,
    })),
  };
}

export async function createTask(ctx: RecordCtx, input: TaskFields) {
  need(ctx, "tasks:create");
  if (!input.title?.trim()) throw new ApiError(400, "Geef de taak een titel.");
  const assigneeId = input.assigneeId === undefined ? ctx.userId : input.assigneeId;
  if (assigneeId) await assertAssignee(ctx, assigneeId);
  let teamId: string | null = null;
  if (input.companyId) {
    // Koppelen aan een dossier buiten bereik is niet mogelijk (404).
    teamId = (await visibleCompany(ctx, input.companyId)).teamId;
  }
  return prisma.commercialTask.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      assigneeId,
      createdById: ctx.userId,
      teamId,
      dueAt: input.dueAt ?? null,
      priority: input.priority ?? "NORMAL",
      companyId: input.companyId ?? null,
    },
  });
}

export async function updateTask(ctx: RecordCtx, id: string, input: Partial<TaskFields> & { version: number }) {
  need(ctx, "tasks:update");
  const current = await visibleTask(ctx, id);
  if (input.assigneeId && input.assigneeId !== current.assigneeId) await assertAssignee(ctx, input.assigneeId);
  if (input.title !== undefined && !input.title.trim()) throw new ApiError(400, "Geef de taak een titel.");
  const res = await prisma.commercialTask.updateMany({
    where: { id, version: input.version },
    data: {
      title: input.title?.trim(),
      description: input.description === undefined ? undefined : input.description?.trim() || null,
      assigneeId: input.assigneeId,
      dueAt: input.dueAt,
      priority: input.priority,
      version: { increment: 1 },
    },
  });
  if (res.count === 0) throw new ApiError(409, "Deze taak is intussen gewijzigd. Laad hem opnieuw en probeer het nog eens.");
}

/** Afronden en heropenen zijn schrijfacties en vereisen dus 'tasks:update'. */
export async function setTaskDone(ctx: RecordCtx, id: string, done: boolean) {
  need(ctx, "tasks:update");
  await visibleTask(ctx, id);
  await prisma.commercialTask.update({
    where: { id },
    data: done
      ? { status: "DONE", completedAt: new Date(), completedById: ctx.userId, version: { increment: 1 } }
      : { status: "OPEN", completedAt: null, completedById: null, version: { increment: 1 } },
  });
}
