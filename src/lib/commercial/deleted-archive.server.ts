import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { audit } from "@/lib/audit";
import { auditRecord, need, notFound, type RecordCtx } from "./ctx.server";
import { visibleCompany } from "./companies.server";

// Gesloten archief: een verwijderd sponsordossier verdwijnt uit alle lijsten, overzichten,
// rapportages, herinneringen en mailings, maar er wordt niets gewist. Het dossier en alles
// wat eraan hangt (contactpersonen, contactmomenten, taken, bestanden, contracten, kansen en
// facturen) blijft bewaard en is alleen te zien voor wie 'deleted_archive:read' heeft
// (hoofdadmin en de rol Beheerder Commerciële Zaken). Terugzetten maakt alles weer zichtbaar.
//
// Verwijderen vraagt 'companies:archive' (uit de actieve lijsten halen, blijft bewaard).
// Verborgen gaat via companyScopeWhere (deletedAt: null) en visibleCompany.

const REASON_MAX = 500;

/** Wat er aan een dossier vastzit; getoond in de bevestiging en in het archief. */
export async function linkedCounts(companyId: string) {
  const [contacts, activities, tasks, files, contracts, opportunities, invoices] = await Promise.all([
    prisma.commercialContact.count({ where: { companyId } }),
    prisma.commercialActivity.count({ where: { companyId } }),
    prisma.commercialTask.count({ where: { companyId } }),
    prisma.commercialFile.count({ where: { companyId } }),
    prisma.commercialContract.count({ where: { companyId } }),
    prisma.commercialOpportunity.count({ where: { companyId } }),
    prisma.commercialInvoice.count({ where: { companyId } }),
  ]);
  return { contacts, activities, tasks, files, contracts, opportunities, invoices };
}

export type LinkedCounts = Awaited<ReturnType<typeof linkedCounts>>;

/** Voor de bevestigingsvraag: wat gaat er mee naar het archief? */
export async function deletePreview(ctx: RecordCtx, id: string) {
  need(ctx, "companies:archive");
  const company = await visibleCompany(ctx, id);
  const [counts, activeContracts] = await Promise.all([
    linkedCounts(id),
    prisma.commercialContract.count({ where: { companyId: id, status: "ACTIVE", archivedAt: null } }),
  ]);
  return { id, name: company.name, counts, activeContracts };
}

export async function deleteCompany(ctx: RecordCtx, id: string, input: { confirm: boolean; reason?: string | null }) {
  need(ctx, "companies:archive");
  if (input.confirm !== true) throw new ApiError(400, "Bevestig eerst dat je dit dossier wilt verwijderen.");
  const company = await visibleCompany(ctx, id);
  const reason = input.reason?.trim().slice(0, REASON_MAX) || null;
  const counts = await linkedCounts(id);
  const res = await prisma.commercialCompany.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: ctx.userId, deletedByLabel: ctx.label, deleteReason: reason, version: { increment: 1 } },
  });
  if (res.count === 0) notFound("Bedrijf");
  await auditRecord(ctx, { action: "company.delete", entity: "company", entityId: id, after: { name: company.name, reason, counts } });
  await audit({
    action: "commercial.company_deleted",
    actor: { id: ctx.userId, name: ctx.label },
    target: { type: "commercial_company", id, name: company.name },
    summary: `Sponsordossier “${company.name}” verwijderd naar het gesloten archief`,
    meta: { reason, counts },
  });
  return { ok: true };
}

export async function listDeletedCompanies(ctx: RecordCtx, q: { q?: string }) {
  need(ctx, "deleted_archive:read");
  const term = q.q?.trim();
  const rows = await prisma.commercialCompany.findMany({
    where: {
      deletedAt: { not: null },
      ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { tradeName: { contains: term, mode: "insensitive" } }, { city: { contains: term, mode: "insensitive" } }] } : {}),
    },
    orderBy: { deletedAt: "desc" },
    take: 200,
    select: { id: true, name: true, tradeName: true, city: true, status: true, sponsorTier: true, deletedAt: true, deletedByLabel: true, deleteReason: true },
  });
  return { rows, canRestore: ctx.can("deleted_archive:update") };
}

/** Het volledige dossier, alleen-lezen, zoals het was op het moment van verwijderen. */
export async function getDeletedCompany(ctx: RecordCtx, id: string) {
  need(ctx, "deleted_archive:read");
  const company = await prisma.commercialCompany.findUnique({ where: { id } });
  if (!company || !company.deletedAt) notFound("Verwijderd dossier");
  const [counts, contacts, activities, tasks, files, contracts, opportunities, invoices, owner] = await Promise.all([
    linkedCounts(id),
    prisma.commercialContact.findMany({ where: { companyId: id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    prisma.commercialActivity.findMany({ where: { companyId: id }, orderBy: { occurredAt: "desc" }, take: 200, include: { contact: { select: { name: true } } } }),
    prisma.commercialTask.findMany({ where: { companyId: id }, orderBy: [{ status: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }], take: 200 }),
    prisma.commercialFile.findMany({ where: { companyId: id }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, name: true, category: true, version: true, archivedAt: true, createdAt: true } }),
    prisma.commercialContract.findMany({ where: { companyId: id }, orderBy: { startsOn: "desc" }, include: { season: { select: { name: true } } } }),
    prisma.commercialOpportunity.findMany({ where: { companyId: id }, orderBy: { createdAt: "desc" } }),
    prisma.commercialInvoice.findMany({ where: { companyId: id }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, status: true, number: true, issuedOn: true, createdAt: true } }),
    company.ownerId ? prisma.user.findUnique({ where: { id: company.ownerId }, select: { name: true } }) : null,
  ]);
  const showAmounts = ctx.can("amounts:read");
  return {
    company: { ...company, ownerName: owner?.name ?? null },
    counts,
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, jobTitle: c.jobTitle, email: c.email, phone: c.phone, role: c.role, archived: !!c.archivedAt })),
    activities: activities.map((a) => ({ id: a.id, kind: a.kind, occurredAt: a.occurredAt, isPlanned: a.isPlanned, summary: a.summary, contactName: a.contact?.name ?? null, archived: !!a.archivedAt })),
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, dueAt: t.dueAt })),
    files: files.map((f) => ({ id: f.id, name: f.name, category: f.category, version: f.version, archived: !!f.archivedAt, createdAt: f.createdAt })),
    contracts: contracts.map((c) => ({ id: c.id, seasonName: c.season.name, status: c.status, startsOn: c.startsOn, endsOn: c.endsOn, amountCents: showAmounts ? c.amountCents : null, archived: !!c.archivedAt })),
    opportunities: opportunities.map((o) => ({ id: o.id, title: o.title, stage: o.stage, archived: !!o.archivedAt })),
    invoices: ctx.can("invoices:read") || ctx.can("credit_notes:read") ? invoices : [],
    canRestore: ctx.can("deleted_archive:update"),
  };
}

export async function restoreDeletedCompany(ctx: RecordCtx, id: string) {
  need(ctx, "deleted_archive:read");
  need(ctx, "deleted_archive:update");
  const company = await prisma.commercialCompany.findUnique({ where: { id }, select: { id: true, name: true, deletedAt: true, deletedByLabel: true, deleteReason: true } });
  if (!company || !company.deletedAt) notFound("Verwijderd dossier");
  await prisma.commercialCompany.update({
    where: { id },
    data: { deletedAt: null, deletedById: null, deletedByLabel: null, deleteReason: null, version: { increment: 1 } },
  });
  const before = { name: company.name, deletedAt: company.deletedAt.toISOString(), deletedBy: company.deletedByLabel, reason: company.deleteReason };
  await auditRecord(ctx, { action: "company.undelete", entity: "company", entityId: id, before });
  await audit({
    action: "commercial.company_restored",
    actor: { id: ctx.userId, name: ctx.label },
    target: { type: "commercial_company", id, name: company.name },
    summary: `Sponsordossier “${company.name}” teruggezet uit het gesloten archief`,
    meta: before,
  });
  return { ok: true };
}
