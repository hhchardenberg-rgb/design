import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { auditRecord, need, type RecordCtx } from "./ctx.server";
import { companyScopeWhere } from "./scope";
import { SPONSOR_TIERS } from "./sponsor-tiers";
import { OPEN_STAGES, STAGE_WEIGHT_PERCENT, isOpenStage, standing, weightedCents, type Standing } from "./forecast";

/** Sleutel voor het totaaldoel van de hele vereniging. */
export const TOTAL = "ALL";
const NO_TIER = "NONE";
export const GOAL_KEYS: string[] = [TOTAL, ...SPONSOR_TIERS.map((t) => t.key as string), NO_TIER];
export const MAX_GOAL_CENTS = 1_000_000_000; // € 10 miljoen: ruim boven elk realistisch sponsordoel

export interface GoalRow {
  key: string;
  name: string;
  /** Aantal lopende contracten en pijplijnkansen; altijd zichtbaar. */
  contractCount: number;
  opportunityCount: number;
  /** Bedragen: null zonder bedragenrecht. */
  targetCents: number | null;
  realisedCents: number | null;
  draftCents: number | null;
  pipelineWeightedCents: number | null;
  /** Alleen gevuld als er een doel is, bedragen zichtbaar zijn en je alle dossiers ziet. */
  standing: Standing | null;
}

/**
 * Doelen en prognose voor een seizoen.
 * - Gerealiseerd = lopende contracten (status ACTIVE) van het seizoen; concepten staan apart en tellen niet mee.
 * - Pijplijn = open kansen met een verwachte sluitdatum binnen het seizoen, gewogen naar fase (zie STAGE_WEIGHT_PERCENT).
 *   Kansen zonder verwachte datum of zonder bedrag tellen niet mee en worden apart gemeld.
 * - Het doel geldt voor de hele vereniging. Ziet iemand maar een deel van de dossiers (bereik), dan worden
 *   de cijfers wel getoond maar geen "nog nodig" of voortgang berekend, om geen schijnprecisie te geven.
 */
export async function getGoals(ctx: RecordCtx, seasonId: string) {
  need(ctx, "reports:read");
  need(ctx, "contracts:read");
  const season = await prisma.commercialSeason.findUnique({ where: { id: seasonId } });
  if (!season) throw new ApiError(404, "Seizoen niet gevonden.");
  const amounts = ctx.can("amounts:read");
  const scope = ctx.scope("companies");
  const partial = scope !== "ALL";
  const companyWhere = companyScopeWhere(scope, ctx.viewer);
  const keyOf = (tier: string | null) => tier ?? NO_TIER;

  const [contracts, goals] = await Promise.all([
    prisma.commercialContract.findMany({
      where: { seasonId, archivedAt: null, status: { in: ["ACTIVE", "DRAFT"] }, company: companyWhere },
      select: { status: true, amountCents: true, company: { select: { sponsorTier: true } } },
    }),
    amounts ? prisma.commercialGoal.findMany({ where: { seasonId } }) : Promise.resolve([]),
  ]);

  const canPipeline = ctx.can("opportunities:read");
  const opps = canPipeline
    ? await prisma.commercialOpportunity.findMany({
        where: { archivedAt: null, stage: { in: [...OPEN_STAGES] }, company: companyWhere },
        select: { stage: true, expectedAmountCents: true, expectedCloseOn: true, company: { select: { sponsorTier: true } } },
      })
    : [];
  const startsOn = season.startsOn.getTime();
  const endsOn = season.endsOn.getTime();
  const inSeason = opps.filter((o) => o.expectedCloseOn && o.expectedCloseOn.getTime() >= startsOn && o.expectedCloseOn.getTime() <= endsOn);
  const undated = opps.filter((o) => !o.expectedCloseOn).length;
  const noAmount = inSeason.filter((o) => o.expectedAmountCents == null).length;

  const target = new Map(goals.map((g) => [g.tier, g.targetCents]));
  const build = (key: string, name: string, match: (tier: string | null) => boolean): GoalRow => {
    const active = contracts.filter((c) => c.status === "ACTIVE" && match(c.company.sponsorTier));
    const drafts = contracts.filter((c) => c.status === "DRAFT" && match(c.company.sponsorTier));
    const pipe = inSeason.filter((o) => match(o.company.sponsorTier));
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const realised = sum(active.map((c) => c.amountCents ?? 0));
    const weighted = sum(pipe.map((o) => (o.expectedAmountCents != null && isOpenStage(o.stage) ? weightedCents(o.stage, o.expectedAmountCents) : 0)));
    const goal = target.get(key);
    return {
      key, name,
      contractCount: active.length,
      opportunityCount: pipe.length,
      targetCents: amounts ? goal ?? null : null,
      realisedCents: amounts ? realised : null,
      draftCents: amounts ? sum(drafts.map((c) => c.amountCents ?? 0)) : null,
      pipelineWeightedCents: amounts && canPipeline ? weighted : null,
      standing: amounts && !partial && goal != null ? standing(goal, realised, amounts && canPipeline ? weighted : 0) : null,
    };
  };

  const tierRows = SPONSOR_TIERS.map((t) => build(t.key, t.label, (x) => x === t.key));
  const noneRow = build(NO_TIER, "Zonder vorm", (x) => keyOf(x) === NO_TIER);
  const rows = [build(TOTAL, "Totaal", () => true), ...tierRows, ...(noneRow.contractCount + noneRow.opportunityCount > 0 || noneRow.targetCents != null ? [noneRow] : [])];

  return {
    season: { id: season.id, name: season.name, startsOn: season.startsOn.toISOString().slice(0, 10), endsOn: season.endsOn.toISOString().slice(0, 10) },
    amountsVisible: amounts,
    pipelineVisible: canPipeline,
    partial,
    weights: Object.entries(STAGE_WEIGHT_PERCENT).map(([stage, percent]) => ({ stage, percent })),
    notes: { undatedOpportunities: undated, opportunitiesWithoutAmount: noAmount },
    rows,
  };
}

/** Doelen opslaan. Een doel is een financieel gegeven: vereist instellingen beheren én bedragenrecht. Null of leeg verwijdert het doel. */
export async function setGoals(ctx: RecordCtx, seasonId: string, input: { tier: string; targetCents: number | null }[]) {
  need(ctx, "settings:manage_settings");
  need(ctx, "amounts:read");
  if (!(await prisma.commercialSeason.findUnique({ where: { id: seasonId }, select: { id: true } }))) throw new ApiError(404, "Seizoen niet gevonden.");
  const seen = new Set<string>();
  for (const g of input) {
    if (!GOAL_KEYS.includes(g.tier)) throw new ApiError(400, "Onbekende sponsorvorm.");
    if (seen.has(g.tier)) throw new ApiError(400, "Een sponsorvorm komt dubbel voor.");
    seen.add(g.tier);
    if (g.targetCents != null && (!Number.isInteger(g.targetCents) || g.targetCents < 0 || g.targetCents > MAX_GOAL_CENTS)) throw new ApiError(400, "Geef een geldig bedrag op (0 tot € 10.000.000).");
  }
  const existing = new Map((await prisma.commercialGoal.findMany({ where: { seasonId } })).map((g) => [g.tier, g.targetCents]));
  await prisma.$transaction(
    input.map((g) =>
      g.targetCents == null
        ? prisma.commercialGoal.deleteMany({ where: { seasonId, tier: g.tier } })
        : prisma.commercialGoal.upsert({
            where: { seasonId_tier: { seasonId, tier: g.tier } },
            create: { seasonId, tier: g.tier, targetCents: g.targetCents, updatedById: ctx.userId },
            update: { targetCents: g.targetCents, updatedById: ctx.userId },
          }),
    ),
  );
  // Het logboek bevat bewust geen bedragen: alleen welke doelen zijn gezet, gewijzigd of verwijderd.
  const changed = input.filter((g) => (existing.get(g.tier) ?? null) !== g.targetCents).map((g) => ({ tier: g.tier, change: g.targetCents == null ? "verwijderd" : existing.has(g.tier) ? "gewijzigd" : "gezet" }));
  if (changed.length > 0) await auditRecord(ctx, { action: "goal.update", entity: "goal", entityId: seasonId, after: { doelen: changed } });
}
