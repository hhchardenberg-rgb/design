import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { auditRecord, need, notFound, type RecordCtx } from "./ctx.server";
import { visibleCompany } from "./companies.server";
import { createContract, dateOnly } from "./contracts.server";
import { companyScopeWhere } from "./scope";

export const STAGES = ["LEAD", "CONTACTED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
export type Stage = (typeof STAGES)[number];
const OPEN_STAGES: Stage[] = ["LEAD", "CONTACTED", "PROPOSAL", "NEGOTIATION"];

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const canSeeAmounts = (ctx: RecordCtx) => ctx.can("amounts:read");

type Row = Prisma.CommercialOpportunityGetPayload<{ include: { company: { select: { name: true } } } }>;
function present(ctx: RecordCtx, o: Row, owner: Map<string, string>) {
  return {
    id: o.id, companyId: o.companyId, companyName: o.company.name, title: o.title, stage: o.stage, packageId: o.packageId,
    expectedCloseOn: iso(o.expectedCloseOn), ownerId: o.ownerId, ownerName: o.ownerId ? owner.get(o.ownerId) ?? null : null,
    lostReason: o.lostReason, notes: o.notes, wonContractId: o.wonContractId, stageChangedAt: o.stageChangedAt, version: o.version,
    amountVisible: canSeeAmounts(ctx), expectedAmountCents: canSeeAmounts(ctx) ? o.expectedAmountCents : null,
  };
}
const INCLUDE = { company: { select: { name: true } } } as const;

async function ownerNames(ids: (string | null)[]) {
  const list = [...new Set(ids.filter(Boolean) as string[])];
  const users = list.length ? await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true } }) : [];
  return new Map(users.map((u) => [u.id, u.name ?? ""]));
}

async function visibleOpportunity(ctx: RecordCtx, id: string) {
  const o = await prisma.commercialOpportunity.findUnique({ where: { id }, include: INCLUDE });
  if (!o) notFound("Kans");
  await visibleCompany(ctx, o.companyId);
  return o;
}

export interface OpportunityListQuery {
  companyId?: string;
  mine?: boolean;
  includeClosed?: boolean;
}

/** Pijplijn: alle kansen binnen het dossierbereik van de gebruiker. */
export async function listOpportunities(ctx: RecordCtx, q: OpportunityListQuery) {
  need(ctx, "opportunities:read");
  if (q.companyId) await visibleCompany(ctx, q.companyId);
  const where: Prisma.CommercialOpportunityWhereInput = {
    archivedAt: null,
    company: companyScopeWhere(ctx.scope("companies"), ctx.viewer),
    ...(q.companyId ? { companyId: q.companyId } : {}),
    ...(q.mine ? { ownerId: ctx.userId } : {}),
    ...(q.includeClosed ? {} : { stage: { in: OPEN_STAGES } }),
  };
  const rows = await prisma.commercialOpportunity.findMany({ where, include: INCLUDE, orderBy: [{ expectedCloseOn: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 500 });
  const names = await ownerNames(rows.map((r) => r.ownerId));
  const items = rows.map((r) => present(ctx, r, names));
  // Totaal verwachte waarde alleen voor wie bedragen mag zien; anders zou het totaal een lek zijn.
  const totalExpectedCents = canSeeAmounts(ctx) ? rows.filter((r) => OPEN_STAGES.includes(r.stage as Stage)).reduce((s, r) => s + (r.expectedAmountCents ?? 0), 0) : null;
  return { items, totalExpectedCents };
}

export interface OpportunityInput {
  title: string;
  packageId?: string | null;
  expectedAmountCents?: number | null;
  expectedCloseOn?: string | null;
  ownerId?: string | null;
  notes?: string | null;
}

async function assertOwner(ctx: RecordCtx, ownerId: string | null | undefined) {
  if (!ownerId) return;
  if (!(await prisma.commercialMembership.findUnique({ where: { userId: ownerId } }))) throw new ApiError(400, "De verantwoordelijke heeft geen toegang tot Commerciële Zaken.");
  if (ctx.scope("companies") !== "ALL" && ownerId !== ctx.userId) throw new ApiError(403, "Met jouw bereik kun je alleen jezelf als verantwoordelijke kiezen.");
}
function amount(n: number | null | undefined) {
  if (n == null) return null;
  if (!Number.isInteger(n) || n < 0 || n > 100_000_000_00) throw new ApiError(400, "Ongeldig bedrag.");
  return n;
}

export async function createOpportunity(ctx: RecordCtx, companyId: string, input: OpportunityInput) {
  need(ctx, "opportunities:create");
  const company = await visibleCompany(ctx, companyId);
  if (company.archivedAt) throw new ApiError(409, "Dit dossier is gearchiveerd.");
  if (!input.title.trim()) throw new ApiError(400, "Geef de kans een titel.");
  if (input.expectedAmountCents != null) need(ctx, "amounts:update");
  const ownerId = input.ownerId === undefined ? ctx.userId : input.ownerId;
  await assertOwner(ctx, ownerId);
  const o = await prisma.commercialOpportunity.create({
    data: { companyId, title: input.title.trim(), packageId: input.packageId ?? null, expectedAmountCents: amount(input.expectedAmountCents), expectedCloseOn: dateOnly(input.expectedCloseOn), ownerId, notes: input.notes?.trim() || null, createdById: ctx.userId },
  });
  await auditRecord(ctx, { action: "opportunity.create", entity: "opportunity", entityId: o.id, after: { companyId } });
  return o.id;
}

export async function updateOpportunity(ctx: RecordCtx, id: string, input: Partial<OpportunityInput> & { version: number }) {
  need(ctx, "opportunities:update");
  const cur = await visibleOpportunity(ctx, id);
  if (cur.stage === "WON" || cur.stage === "LOST") throw new ApiError(409, "Een afgesloten kans kan niet meer worden gewijzigd.");
  const amountChanged = input.expectedAmountCents !== undefined && input.expectedAmountCents !== cur.expectedAmountCents;
  if (amountChanged) need(ctx, "amounts:update");
  const ownerChanged = input.ownerId !== undefined && input.ownerId !== cur.ownerId;
  if (ownerChanged) await assertOwner(ctx, input.ownerId);
  if (input.title !== undefined && !input.title.trim()) throw new ApiError(400, "Geef de kans een titel.");
  const r = await prisma.commercialOpportunity.updateMany({
    where: { id, version: input.version },
    data: {
      title: input.title?.trim(), packageId: input.packageId, expectedAmountCents: amountChanged ? amount(input.expectedAmountCents) : undefined,
      expectedCloseOn: input.expectedCloseOn !== undefined ? dateOnly(input.expectedCloseOn) : undefined,
      ownerId: ownerChanged ? input.ownerId : undefined, notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
      version: { increment: 1 },
    },
  });
  if (r.count === 0) throw new ApiError(409, "Deze kans is intussen door iemand anders gewijzigd. Laad de pijplijn opnieuw.");
  await auditRecord(ctx, { action: "opportunity.update", entity: "opportunity", entityId: id, after: { amountChanged, ownerChanged } });
}

const FORWARD: Record<string, Stage[]> = {
  LEAD: ["CONTACTED", "PROPOSAL", "NEGOTIATION", "LOST"],
  CONTACTED: ["LEAD", "PROPOSAL", "NEGOTIATION", "LOST"],
  PROPOSAL: ["CONTACTED", "NEGOTIATION", "LOST"],
  NEGOTIATION: ["PROPOSAL", "LOST"],
};

/** Verplaatst een kans binnen de open fasen of sluit hem als verloren. Winnen gaat via convertToContract. */
export async function moveStage(ctx: RecordCtx, id: string, to: Stage, lostReason?: string | null) {
  need(ctx, "opportunities:update");
  const cur = await visibleOpportunity(ctx, id);
  if (to === "WON") throw new ApiError(400, "Een kans win je door er een contract van te maken.");
  if (!FORWARD[cur.stage]?.includes(to)) throw new ApiError(409, "Deze fasewijziging is niet mogelijk.");
  if (to === "LOST" && !lostReason?.trim()) throw new ApiError(400, "Geef aan waarom de kans verloren is.");
  const r = await prisma.commercialOpportunity.updateMany({
    where: { id, stage: cur.stage },
    data: { stage: to, stageChangedAt: new Date(), lostReason: to === "LOST" ? lostReason!.trim().slice(0, 500) : null, version: { increment: 1 } },
  });
  if (r.count === 0) throw new ApiError(409, "De fase is intussen gewijzigd. Laad de pijplijn opnieuw.");
  await auditRecord(ctx, { action: "opportunity.stage", entity: "opportunity", entityId: id, before: { stage: cur.stage }, after: { stage: to } });
}

/**
 * Wint de kans: maakt een concept-contract voor het gekozen seizoen (pakket en, met bedragenrechten,
 * de verwachte waarde worden overgenomen) en sluit de kans. Alles of niets.
 */
export async function convertToContract(ctx: RecordCtx, id: string, input: { seasonId: string; startsOn: string; endsOn: string }) {
  need(ctx, "opportunities:update");
  need(ctx, "contracts:create");
  const cur = await visibleOpportunity(ctx, id);
  if (!OPEN_STAGES.includes(cur.stage as Stage)) throw new ApiError(409, "Deze kans is al afgesloten.");
  const claimed = await prisma.commercialOpportunity.updateMany({ where: { id, stage: cur.stage }, data: { stage: "WON", stageChangedAt: new Date(), version: { increment: 1 } } });
  if (claimed.count === 0) throw new ApiError(409, "De fase is intussen gewijzigd. Laad de pijplijn opnieuw.");
  try {
    const contractId = await createContract(ctx, cur.companyId, {
      seasonId: input.seasonId, packageId: cur.packageId, startsOn: input.startsOn, endsOn: input.endsOn,
      ...(ctx.can("amounts:update") && cur.expectedAmountCents != null ? { amountCents: cur.expectedAmountCents } : {}),
    });
    await prisma.commercialOpportunity.update({ where: { id }, data: { wonContractId: contractId } });
    await auditRecord(ctx, { action: "opportunity.won", entity: "opportunity", entityId: id, after: { contractId } });
    return contractId;
  } catch (e) {
    // Contract maken mislukt (bv. seizoen dicht): de kans blijft open.
    await prisma.commercialOpportunity.update({ where: { id }, data: { stage: cur.stage, stageChangedAt: cur.stageChangedAt } });
    throw e;
  }
}

export async function archiveOpportunity(ctx: RecordCtx, id: string) {
  need(ctx, "opportunities:archive");
  await visibleOpportunity(ctx, id);
  await prisma.commercialOpportunity.update({ where: { id }, data: { archivedAt: new Date() } });
  await auditRecord(ctx, { action: "opportunity.archive", entity: "opportunity", entityId: id });
}
