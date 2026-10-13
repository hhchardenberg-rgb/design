import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { auditRecord, need, notFound, type RecordCtx } from "./ctx.server";
import { companyScopeWhere } from "./scope";
import { visibleCompany } from "./companies.server";

// Contactmomenten terugvinden, herstellen en definitief wissen. Archiveren en aanmaken staan
// in companies.server.ts.

export const ACTIVITY_PAGE_SIZE = 100;

export interface ActivityQuery {
  /** Alleen dit dossier; zonder companyId wordt gezocht in alle dossiers binnen het eigen bereik. */
  companyId?: string;
  archived: boolean;
  /** Zoekt in samenvatting, vervolgactie, bedrijfsnaam en contactpersoon. */
  q?: string;
}

export async function findActivities(ctx: RecordCtx, query: ActivityQuery) {
  need(ctx, "history:read");
  need(ctx, "companies:read");
  if (query.companyId) await visibleCompany(ctx, query.companyId);
  const q = query.q?.trim();
  const where: Prisma.CommercialActivityWhereInput = {
    AND: [
      query.companyId ? { companyId: query.companyId } : { company: companyScopeWhere(ctx.scope("companies"), ctx.viewer) },
      query.archived ? { archivedAt: { not: null } } : { archivedAt: null },
      q
        ? {
            OR: [
              { summary: { contains: q, mode: "insensitive" } },
              { followUp: { contains: q, mode: "insensitive" } },
              { company: { name: { contains: q, mode: "insensitive" } } },
              { contact: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const [total, rows] = await Promise.all([
    prisma.commercialActivity.count({ where }),
    prisma.commercialActivity.findMany({
      where,
      orderBy: query.archived ? [{ archivedAt: "desc" }, { occurredAt: "desc" }] : { occurredAt: "desc" },
      take: ACTIVITY_PAGE_SIZE,
      include: { contact: { select: { name: true } }, company: { select: { name: true } } },
    }),
  ]);
  const authors = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.authorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const name = new Map(authors.map((a) => [a.id, a.name]));
  return {
    total,
    activities: rows.map(({ contact, company, ...r }) => ({
      ...r,
      companyName: company.name,
      contactName: contact?.name ?? null,
      authorName: r.authorId ? (name.get(r.authorId) ?? null) : null,
    })),
  };
}

async function visibleActivity(ctx: RecordCtx, id: string) {
  const a = await prisma.commercialActivity.findUnique({ where: { id } });
  if (!a) notFound("Contactmoment");
  await visibleCompany(ctx, a.companyId);
  return a;
}

export async function restoreActivity(ctx: RecordCtx, id: string) {
  need(ctx, "history:archive");
  const a = await visibleActivity(ctx, id);
  if (!a.archivedAt) throw new ApiError(409, "Dit contactmoment is niet gearchiveerd.");
  await prisma.commercialActivity.update({ where: { id }, data: { archivedAt: null } });
  await auditRecord(ctx, { action: "activity.restore", entity: "activity", entityId: id, after: { companyId: a.companyId } });
}

/**
 * Wist een contactmoment onherroepelijk, actief of gearchiveerd. Gekoppelde taken blijven bestaan
 * (zonder verwijzing). Het logboek bewaart alleen dat er gewist is, nooit de inhoud.
 */
export async function deleteActivity(ctx: RecordCtx, id: string) {
  need(ctx, "history:delete");
  const a = await visibleActivity(ctx, id);
  await prisma.commercialActivity.delete({ where: { id } });
  await auditRecord(ctx, {
    action: "activity.delete",
    entity: "activity",
    entityId: id,
    before: { companyId: a.companyId, kind: a.kind, occurredAt: a.occurredAt.toISOString(), wasArchived: !!a.archivedAt },
  });
}
