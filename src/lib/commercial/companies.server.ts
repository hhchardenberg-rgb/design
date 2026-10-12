import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { auditRecord, need, notFound, type RecordCtx } from "./ctx.server";
import { canSeeOwned, companyScopeWhere, normalizeNameKey } from "./scope";

export const COMPANY_STATUSES = ["PROSPECT", "ACTIVE", "FORMER"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export interface CompanyFields {
  name: string;
  tradeName?: string | null;
  status?: CompanyStatus;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  kvkNumber?: string | null;
  vatNumber?: string | null;
  billingName?: string | null;
  billingEmail?: string | null;
  billingAddress?: string | null;
  industry?: string | null;
  tags?: string[];
  sponsorCategory?: string | null;
  source?: string | null;
  internalNotes?: string | null;
}

const clean = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim());

function fieldData(f: Partial<CompanyFields>): Prisma.CommercialCompanyUncheckedUpdateInput {
  return {
    name: f.name?.trim(),
    nameKey: f.name ? normalizeNameKey(f.name) : undefined,
    tradeName: clean(f.tradeName),
    status: f.status,
    street: clean(f.street),
    postalCode: clean(f.postalCode),
    city: clean(f.city),
    country: clean(f.country),
    website: clean(f.website),
    email: clean(f.email),
    phone: clean(f.phone),
    kvkNumber: clean(f.kvkNumber),
    vatNumber: clean(f.vatNumber),
    billingName: clean(f.billingName),
    billingEmail: clean(f.billingEmail),
    billingAddress: clean(f.billingAddress),
    industry: clean(f.industry),
    tags: f.tags?.map((t) => t.trim()).filter(Boolean),
    sponsorCategory: clean(f.sponsorCategory),
    source: clean(f.source),
    internalNotes: clean(f.internalNotes),
  };
}

/** Haalt een bedrijf op dat binnen het bereik van de gebruiker valt, anders 404. */
export async function visibleCompany(ctx: RecordCtx, id: string) {
  const company = await prisma.commercialCompany.findUnique({ where: { id } });
  if (!company || !canSeeOwned(ctx.scope("companies"), company, ctx.viewer)) notFound("Bedrijf");
  return company;
}

export interface CompanyListQuery {
  q?: string;
  status?: CompanyStatus;
  ownerId?: string;
  mine?: boolean;
  tag?: string;
  /** Alleen sponsoren zonder openstaande taak ('Geen vervolgactie'). */
  noAction?: boolean;
  archived?: boolean;
  sort?: "name" | "city" | "status" | "updatedAt";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export async function listCompanies(ctx: RecordCtx, query: CompanyListQuery) {
  need(ctx, "companies:read");
  const where: Prisma.CommercialCompanyWhereInput = {
    AND: [
      companyScopeWhere(ctx.scope("companies"), ctx.viewer),
      { archivedAt: query.archived ? { not: null } : null },
      query.status ? { status: query.status } : {},
      query.mine ? { ownerId: ctx.userId } : query.ownerId ? { ownerId: query.ownerId } : {},
      query.tag ? { tags: { has: query.tag } } : {},
      query.noAction ? { tasks: { none: { status: "OPEN" as const } } } : {},
      query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { tradeName: { contains: query.q, mode: "insensitive" } },
              { city: { contains: query.q, mode: "insensitive" } },
              { kvkNumber: { contains: query.q } },
            ],
          }
        : {},
    ],
  };
  const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const sort = query.sort ?? "name";
  const [total, rows] = await Promise.all([
    prisma.commercialCompany.count({ where }),
    prisma.commercialCompany.findMany({
      where,
      orderBy: { [sort]: query.dir ?? "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, name: true, tradeName: true, status: true, city: true, ownerId: true, tags: true, updatedAt: true },
    }),
  ]);

  const ids = rows.map((r) => r.id);
  const [lastContacts, openTasks, owners] = await Promise.all([
    ctx.can("history:read")
      ? prisma.commercialActivity.groupBy({ by: ["companyId"], where: { companyId: { in: ids }, isPlanned: false, archivedAt: null }, _max: { occurredAt: true } })
      : Promise.resolve([]),
    ctx.can("tasks:read")
      ? prisma.commercialTask.groupBy({ by: ["companyId"], where: { companyId: { in: ids }, status: "OPEN" }, _count: { _all: true }, _min: { dueAt: true } })
      : Promise.resolve([]),
    prisma.user.findMany({ where: { id: { in: rows.map((r) => r.ownerId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
  ]);
  const ownerName = new Map(owners.map((o) => [o.id, o.name]));
  return {
    total,
    page,
    pageSize,
    rows: rows.map((r) => ({
      ...r,
      updatedAt: r.updatedAt.toISOString(),
      ownerName: r.ownerId ? (ownerName.get(r.ownerId) ?? null) : null,
      lastContactAt: lastContacts.find((l) => l.companyId === r.id)?._max.occurredAt?.toISOString() ?? null,
      openTasks: openTasks.find((t) => t.companyId === r.id)?._count._all ?? 0,
      nextActionDue: openTasks.find((t) => t.companyId === r.id)?._min.dueAt?.toISOString() ?? null,
    })),
  };
}

/** Dubbelcontrole: bestaande bedrijven buiten bereik worden alleen als aantal gemeld, niet inhoudelijk. */
export async function findDuplicates(ctx: RecordCtx, input: { name: string; kvkNumber?: string | null; excludeId?: string }) {
  need(ctx, "companies:read");
  const key = normalizeNameKey(input.name);
  const where: Prisma.CommercialCompanyWhereInput = {
    id: input.excludeId ? { not: input.excludeId } : undefined,
    OR: [{ nameKey: key }, ...(input.kvkNumber ? [{ kvkNumber: input.kvkNumber.trim() }] : [])],
  };
  const all = await prisma.commercialCompany.findMany({ where, select: { id: true, name: true, city: true, ownerId: true, teamId: true, archivedAt: true } });
  const visible = all.filter((c) => canSeeOwned(ctx.scope("companies"), c, ctx.viewer));
  return {
    visible: visible.map((c) => ({ id: c.id, name: c.name, city: c.city, archived: !!c.archivedAt })),
    hiddenCount: all.length - visible.length,
  };
}

async function assertOwnerAllowed(ctx: RecordCtx, ownerId: string | null, teamId: string | null) {
  const scope = ctx.scope("companies");
  if (ownerId) {
    const m = await prisma.commercialMembership.findUnique({ where: { userId: ownerId } });
    if (!m) throw new ApiError(400, "De verantwoordelijke heeft geen toegang tot Commerciële Zaken.");
  }
  if (scope !== "ALL" && ownerId !== ctx.userId) {
    throw new ApiError(403, "Met jouw bereik kun je alleen jezelf als verantwoordelijke kiezen.");
  }
  if (teamId && scope !== "ALL" && !ctx.viewer.teamIds.includes(teamId)) {
    throw new ApiError(403, "Je kunt alleen een team kiezen waar je zelf bij hoort.");
  }
}

export async function createCompany(ctx: RecordCtx, input: CompanyFields & { ownerId?: string | null; teamId?: string | null }) {
  need(ctx, "companies:create");
  if (!input.name?.trim()) throw new ApiError(400, "Geef het bedrijf een naam.");
  const ownerId = input.ownerId === undefined ? ctx.userId : input.ownerId;
  const teamId = input.teamId ?? null;
  await assertOwnerAllowed(ctx, ownerId, teamId);
  const company = await prisma.commercialCompany.create({
    data: { ...(fieldData(input) as Prisma.CommercialCompanyUncheckedCreateInput), name: input.name.trim(), nameKey: normalizeNameKey(input.name), ownerId, teamId, createdById: ctx.userId },
  });
  await auditRecord(ctx, { action: "company.create", entity: "company", entityId: company.id });
  return company;
}

export async function getCompany(ctx: RecordCtx, id: string) {
  need(ctx, "companies:read");
  const company = await visibleCompany(ctx, id);
  const owner = company.ownerId ? await prisma.user.findUnique({ where: { id: company.ownerId }, select: { name: true } }) : null;
  // Keuzelijst voor de verantwoordelijke alleen voor wie eigenaarschap mag wijzigen.
  const canChangeOwner = ctx.can("companies:update") && ctx.scope("companies") === "ALL";
  const ownerOptions = canChangeOwner
    ? (await prisma.commercialMembership.findMany({ include: { user: { select: { id: true, name: true } } } })).map((m) => ({ id: m.user.id, name: m.user.name }))
    : [];
  return { ...company, ownerName: owner?.name ?? null, ownerOptions, canChangeOwner };
}

export async function updateCompany(
  ctx: RecordCtx,
  id: string,
  input: Partial<CompanyFields> & { version: number; ownerId?: string | null; teamId?: string | null },
) {
  need(ctx, "companies:update");
  const current = await visibleCompany(ctx, id);
  const ownerChange = input.ownerId !== undefined && input.ownerId !== current.ownerId;
  const teamChange = input.teamId !== undefined && input.teamId !== current.teamId;
  // Eigenaarschap bepaalt wie een dossier ziet: alleen met bereik 'alles' te wijzigen,
  // zodat niemand zichzelf via een eigenaarswissel meer toegang kan geven.
  if ((ownerChange || teamChange) && ctx.scope("companies") !== "ALL") {
    throw new ApiError(403, "Alleen met bereik 'alles' kun je de verantwoordelijke of het team van een dossier wijzigen.");
  }
  if (ownerChange) await assertOwnerAllowed(ctx, input.ownerId ?? null, input.teamId ?? current.teamId);
  if (input.name !== undefined && !input.name.trim()) throw new ApiError(400, "Geef het bedrijf een naam.");

  const res = await prisma.commercialCompany.updateMany({
    where: { id, version: input.version },
    data: {
      ...(fieldData(input) as Prisma.CommercialCompanyUncheckedUpdateManyInput),
      ownerId: ownerChange ? input.ownerId : undefined,
      teamId: teamChange ? input.teamId : undefined,
      version: { increment: 1 },
    },
  });
  if (res.count === 0) throw new ApiError(409, "Dit dossier is intussen door iemand anders gewijzigd. Laad het opnieuw en probeer het nog eens.");
  if (ownerChange || teamChange) {
    await auditRecord(ctx, {
      action: "company.owner",
      entity: "company",
      entityId: id,
      before: { ownerId: current.ownerId, teamId: current.teamId },
      after: { ownerId: input.ownerId ?? current.ownerId, teamId: input.teamId ?? current.teamId },
    });
  }
  return getCompany(ctx, id);
}

export async function setCompanyArchived(ctx: RecordCtx, id: string, archived: boolean) {
  need(ctx, "companies:archive");
  await visibleCompany(ctx, id);
  await prisma.commercialCompany.update({ where: { id }, data: { archivedAt: archived ? new Date() : null, version: { increment: 1 } } });
  await auditRecord(ctx, { action: archived ? "company.archive" : "company.restore", entity: "company", entityId: id });
}

// --- Contactpersonen ---------------------------------------------------------

export interface ContactFields {
  name: string;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  notes?: string | null;
}

export async function listContacts(ctx: RecordCtx, companyId: string) {
  need(ctx, "contacts:read");
  await visibleCompany(ctx, companyId);
  return prisma.commercialContact.findMany({ where: { companyId, archivedAt: null }, orderBy: { name: "asc" } });
}

export async function createContact(ctx: RecordCtx, companyId: string, input: ContactFields) {
  need(ctx, "contacts:create");
  await visibleCompany(ctx, companyId);
  if (!input.name?.trim()) throw new ApiError(400, "Geef de contactpersoon een naam.");
  return prisma.commercialContact.create({
    data: { companyId, name: input.name.trim(), jobTitle: clean(input.jobTitle), email: clean(input.email), phone: clean(input.phone), role: clean(input.role), notes: clean(input.notes) },
  });
}

async function visibleContact(ctx: RecordCtx, id: string) {
  const contact = await prisma.commercialContact.findUnique({ where: { id } });
  if (!contact) notFound("Contactpersoon");
  await visibleCompany(ctx, contact.companyId);
  return contact;
}

export async function updateContact(ctx: RecordCtx, id: string, input: Partial<ContactFields>) {
  need(ctx, "contacts:update");
  await visibleContact(ctx, id);
  return prisma.commercialContact.update({
    where: { id },
    data: { name: input.name?.trim(), jobTitle: clean(input.jobTitle), email: clean(input.email), phone: clean(input.phone), role: clean(input.role), notes: clean(input.notes) },
  });
}

export async function archiveContact(ctx: RecordCtx, id: string) {
  need(ctx, "contacts:archive");
  await visibleContact(ctx, id);
  await prisma.commercialContact.update({ where: { id }, data: { archivedAt: new Date() } });
}

// --- Contacthistorie ----------------------------------------------------------

export interface ActivityInput {
  contactId?: string | null;
  kind: "CALL" | "VISIT" | "MEETING" | "EMAIL" | "WHATSAPP" | "QUOTE" | "OTHER";
  nature?: "NOTE" | "PROVISIONAL" | "FORMAL";
  occurredAt: Date;
  isPlanned?: boolean;
  summary: string;
  followUp?: string | null;
  followUpTask?: { title: string; dueAt?: Date | null } | null;
}

export async function listActivities(ctx: RecordCtx, companyId: string) {
  need(ctx, "history:read");
  await visibleCompany(ctx, companyId);
  const rows = await prisma.commercialActivity.findMany({
    where: { companyId, archivedAt: null },
    orderBy: { occurredAt: "desc" },
    include: { contact: { select: { name: true } } },
  });
  const authors = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.authorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const name = new Map(authors.map((a) => [a.id, a.name]));
  return rows.map((r) => ({ ...r, contactName: r.contact?.name ?? null, authorName: r.authorId ? (name.get(r.authorId) ?? null) : null, contact: undefined }));
}

export async function createActivity(ctx: RecordCtx, companyId: string, input: ActivityInput) {
  need(ctx, "history:create");
  const company = await visibleCompany(ctx, companyId);
  if (!input.summary?.trim()) throw new ApiError(400, "Vul een samenvatting in.");
  if (input.contactId) {
    const c = await prisma.commercialContact.findUnique({ where: { id: input.contactId } });
    if (!c || c.companyId !== companyId) throw new ApiError(400, "Deze contactpersoon hoort niet bij dit bedrijf.");
  }
  if (input.followUpTask) need(ctx, "tasks:create");
  return prisma.$transaction(async (tx) => {
    const activity = await tx.commercialActivity.create({
      data: {
        companyId,
        contactId: input.contactId ?? null,
        kind: input.kind,
        nature: input.nature ?? "NOTE",
        occurredAt: input.occurredAt,
        isPlanned: input.isPlanned ?? false,
        summary: input.summary.trim(),
        followUp: clean(input.followUp),
        authorId: ctx.userId,
      },
    });
    // Vanuit een contactmoment direct een vervolgtaak aanmaken, in dezelfde transactie.
    if (input.followUpTask?.title.trim()) {
      await tx.commercialTask.create({
        data: {
          title: input.followUpTask.title.trim(),
          dueAt: input.followUpTask.dueAt ?? null,
          assigneeId: ctx.userId,
          createdById: ctx.userId,
          teamId: company.teamId,
          companyId,
          activityId: activity.id,
        },
      });
    }
    return activity;
  });
}

export async function archiveActivity(ctx: RecordCtx, id: string) {
  need(ctx, "history:archive");
  const a = await prisma.commercialActivity.findUnique({ where: { id } });
  if (!a) notFound("Contactmoment");
  await visibleCompany(ctx, a.companyId);
  await prisma.commercialActivity.update({ where: { id }, data: { archivedAt: new Date() } });
}
