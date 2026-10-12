import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { auditRecord, need, type RecordCtx } from "./ctx.server";
import { companyScopeWhere } from "./scope";

export const ROUNDING_STEPS = [1, 100, 500, 1000] as const; // eurocent, euro, 5 euro, 10 euro

/** Nieuw bedrag in eurocenten: oud bedrag plus percentage (in basispunten), afgerond op de gekozen stap. Zuiver en deterministisch. */
export function indexedAmount(baseCents: number, basisPoints: number, roundingCents: number): number {
  const raw = (baseCents * (10_000 + basisPoints)) / 10_000;
  return Math.max(0, Math.round(raw / roundingCents) * roundingCents);
}

export interface IndexationInput {
  seasonId: string;
  basisPoints: number;
  roundingCents: number;
}

function validate(input: IndexationInput) {
  if (!Number.isInteger(input.basisPoints) || input.basisPoints < -2000 || input.basisPoints > 5000) throw new ApiError(400, "Kies een percentage tussen -20% en 50%.");
  if (!(ROUNDING_STEPS as readonly number[]).includes(input.roundingCents)) throw new ApiError(400, "Onbekende afrondingsstap.");
}

/**
 * Welke contracten komen in aanmerking: concept-verlengingen in het gekozen seizoen die nog niet
 * geïndexeerd zijn. De basis is het bedrag van het voorgaande contract, dus de uitkomst is
 * voorspelbaar en een tweede ronde kan niet stapelen.
 */
async function eligible(ctx: RecordCtx, seasonId: string) {
  const drafts = await prisma.commercialContract.findMany({
    where: { seasonId, status: "DRAFT", archivedAt: null, indexationId: null, renewedFromId: { not: null }, company: companyScopeWhere(ctx.scope("companies"), ctx.viewer) },
    include: { company: { select: { name: true } } },
    orderBy: { company: { name: "asc" } },
  });
  const prev = await prisma.commercialContract.findMany({ where: { id: { in: drafts.map((d) => d.renewedFromId!) } }, select: { id: true, amountCents: true } });
  const baseOf = new Map(prev.map((p) => [p.id, p.amountCents]));
  return drafts.map((d) => ({ draft: d, base: baseOf.get(d.renewedFromId!) ?? null }));
}

export async function previewIndexation(ctx: RecordCtx, input: IndexationInput) {
  need(ctx, "amounts:read");
  need(ctx, "contracts:read");
  validate(input);
  const rows = await eligible(ctx, input.seasonId);
  const items = rows.map(({ draft, base }) => ({
    contractId: draft.id, companyId: draft.companyId, companyName: draft.company.name,
    previousCents: base, currentCents: draft.amountCents,
    newCents: base == null ? null : indexedAmount(base, input.basisPoints, input.roundingCents),
  }));
  return { items, skippedWithoutBase: items.filter((i) => i.newCents == null).length };
}

export async function applyIndexation(ctx: RecordCtx, input: IndexationInput) {
  need(ctx, "amounts:approve");
  need(ctx, "amounts:update");
  need(ctx, "contracts:read");
  validate(input);
  const rows = (await eligible(ctx, input.seasonId)).filter((r) => r.base != null);
  if (rows.length === 0) throw new ApiError(409, "Er zijn geen concept-verlengingen om te indexeren in dit seizoen.");
  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.commercialIndexation.create({
      data: { seasonId: input.seasonId, basisPoints: input.basisPoints, roundingCents: input.roundingCents, contractCount: 0, appliedById: ctx.userId },
    });
    let count = 0;
    for (const { draft, base } of rows) {
      // Alleen als het contract intussen niet is gewijzigd of al geïndexeerd.
      const r = await tx.commercialContract.updateMany({
        where: { id: draft.id, version: draft.version, indexationId: null, status: "DRAFT" },
        data: { amountCents: indexedAmount(base!, input.basisPoints, input.roundingCents), indexationId: created.id, version: { increment: 1 } },
      });
      count += r.count;
    }
    if (count === 0) throw new ApiError(409, "De contracten zijn intussen gewijzigd. Maak opnieuw een voorbeeld.");
    return tx.commercialIndexation.update({ where: { id: created.id }, data: { contractCount: count } });
  });
  // Geen bedragen in het auditlog: alleen percentage en aantal.
  await auditRecord(ctx, { action: "indexation.apply", entity: "indexation", entityId: run.id, after: { seasonId: input.seasonId, basisPoints: input.basisPoints, contracts: run.contractCount } });
  return { id: run.id, contracts: run.contractCount };
}

export async function listIndexations(ctx: RecordCtx) {
  need(ctx, "amounts:read");
  const runs = await prisma.commercialIndexation.findMany({ orderBy: { appliedAt: "desc" }, take: 20 });
  const [seasons, users] = await Promise.all([
    prisma.commercialSeason.findMany({ where: { id: { in: runs.map((r) => r.seasonId) } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: runs.map((r) => r.appliedById) } }, select: { id: true, name: true } }),
  ]);
  const sn = new Map(seasons.map((s) => [s.id, s.name]));
  const un = new Map(users.map((u) => [u.id, u.name]));
  return runs.map((r) => ({ id: r.id, seasonName: sn.get(r.seasonId) ?? "", basisPoints: r.basisPoints, contracts: r.contractCount, appliedAt: r.appliedAt, appliedBy: un.get(r.appliedById) ?? null }));
}
