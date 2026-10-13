import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { auditRecord, need, type RecordCtx } from "./ctx.server";
import { companyScopeWhere } from "./scope";
import { clubDay, dayNumber } from "./club-day";
import { SPONSOR_TIERS, isSponsorTier, tierLabel } from "./sponsor-tiers";

/** Sleutel voor sponsoren zonder sponsorvorm. */
export const NO_TIER = "NONE";
export const RULE_KEYS: string[] = [...SPONSOR_TIERS.map((t) => t.key as string), NO_TIER];
export const MAX_INTERVAL_DAYS = 1095;

export interface ContactGap {
  companyId: string;
  companyName: string;
  tier: string | null;
  ownerId: string | null;
  /** Laatste vastgelegde contactmoment (gepland telt niet mee) als YYYY-MM-DD; null = nog nooit. */
  lastContactOn: string | null;
  /** Dagen sinds het laatste contactmoment, of sinds het dossier is aangemaakt als er nog geen is. */
  daysSince: number;
  intervalDays: number;
  overdueDays: number;
}

/**
 * Sponsoren (dossiers met status ACTIVE) die langer dan de ingestelde termijn niet gesproken zijn.
 * - Alleen vastgelegde contactmomenten in het verleden tellen; een geplande afspraak niet.
 * - Staat er een afspraak in de toekomst gepland, dan is er al opvolging en wordt de sponsor niet gemeld.
 * - Zonder regel voor de sponsorvorm is er geen herinnering. Er wordt geen standaardtermijn verzonnen.
 * Kent geen recordbereik: de aanroeper geeft dat mee via `companyWhere`.
 */
export async function computeContactGaps(now: Date, companyWhere: Prisma.CommercialCompanyWhereInput = {}): Promise<ContactGap[]> {
  const rules = await prisma.commercialContactRule.findMany();
  if (rules.length === 0) return [];
  const interval = new Map(rules.map((r) => [r.tier, r.intervalDays]));
  const tierKeys = rules.map((r) => r.tier).filter((k) => k !== NO_TIER);
  const or: Prisma.CommercialCompanyWhereInput[] = [];
  if (tierKeys.length > 0) or.push({ sponsorTier: { in: tierKeys } });
  if (interval.has(NO_TIER)) or.push({ sponsorTier: null });

  const companies = await prisma.commercialCompany.findMany({
    where: { AND: [{ status: "ACTIVE", archivedAt: null, mergedIntoId: null }, companyWhere, { OR: or }] },
    select: { id: true, name: true, sponsorTier: true, ownerId: true, createdAt: true },
  });
  if (companies.length === 0) return [];
  const ids = companies.map((c) => c.id);
  const [lasts, planned] = await Promise.all([
    prisma.commercialActivity.groupBy({ by: ["companyId"], where: { companyId: { in: ids }, isPlanned: false, archivedAt: null, occurredAt: { lte: now } }, _max: { occurredAt: true } }),
    prisma.commercialActivity.groupBy({ by: ["companyId"], where: { companyId: { in: ids }, isPlanned: true, archivedAt: null, occurredAt: { gt: now } }, _count: { _all: true } }),
  ]);
  const lastBy = new Map(lasts.map((l) => [l.companyId, l._max.occurredAt]));
  const hasPlanned = new Set(planned.map((p) => p.companyId));
  const today = dayNumber(clubDay(now));

  const gaps: ContactGap[] = [];
  for (const c of companies) {
    if (hasPlanned.has(c.id)) continue;
    const limit = interval.get(c.sponsorTier ?? NO_TIER);
    if (limit == null) continue;
    const last = lastBy.get(c.id) ?? null;
    const daysSince = today - dayNumber(clubDay(last ?? c.createdAt));
    if (daysSince <= limit) continue;
    gaps.push({ companyId: c.id, companyName: c.name, tier: c.sponsorTier, ownerId: c.ownerId, lastContactOn: last ? clubDay(last) : null, daysSince, intervalDays: limit, overdueDays: daysSince - limit });
  }
  return gaps.sort((a, b) => b.overdueDays - a.overdueDays || a.companyName.localeCompare(b.companyName, "nl"));
}

export interface ContactGapQuery { tiers?: string[]; mine?: boolean; pageSize?: number }

/** Overzicht voor het scherm en het dashboard, binnen het dossierbereik van de gebruiker. */
export async function listContactGaps(ctx: RecordCtx, q: ContactGapQuery = {}) {
  need(ctx, "companies:read");
  need(ctx, "history:read");
  const where: Prisma.CommercialCompanyWhereInput = { AND: [companyScopeWhere(ctx.scope("companies"), ctx.viewer), q.mine ? { ownerId: ctx.userId } : {}] };
  let gaps = await computeContactGaps(new Date(), where);
  if (q.tiers && q.tiers.length > 0) gaps = gaps.filter((g) => q.tiers!.includes(g.tier ?? NO_TIER));
  const owners = await prisma.user.findMany({ where: { id: { in: [...new Set(gaps.map((g) => g.ownerId).filter(Boolean) as string[])] } }, select: { id: true, name: true } });
  const ownerName = new Map(owners.map((o) => [o.id, o.name ?? ""]));
  const rows = gaps.slice(0, q.pageSize ?? gaps.length).map((g) => ({ ...g, tierName: tierLabel(g.tier) ?? "Zonder vorm", ownerName: g.ownerId ? ownerName.get(g.ownerId) ?? null : null }));
  return { total: gaps.length, rows };
}

/** Ingestelde termijnen per sponsorvorm; null = geen herinnering voor die groep. */
export async function getContactRules(ctx: RecordCtx) {
  need(ctx, "companies:read");
  const rules = await prisma.commercialContactRule.findMany();
  const by = new Map(rules.map((r) => [r.tier, r.intervalDays]));
  return { rules: RULE_KEYS.map((tier) => ({ tier, name: tier === NO_TIER ? "Zonder vorm" : (tierLabel(tier) ?? tier), intervalDays: by.get(tier) ?? null })) };
}

export async function setContactRules(ctx: RecordCtx, input: { tier: string; intervalDays: number | null }[]) {
  need(ctx, "settings:manage_settings");
  const seen = new Set<string>();
  for (const r of input) {
    if (!RULE_KEYS.includes(r.tier) || (r.tier !== NO_TIER && !isSponsorTier(r.tier))) throw new ApiError(400, "Onbekende sponsorvorm.");
    if (seen.has(r.tier)) throw new ApiError(400, "Een sponsorvorm komt dubbel voor.");
    seen.add(r.tier);
    if (r.intervalDays != null && (!Number.isInteger(r.intervalDays) || r.intervalDays < 1 || r.intervalDays > MAX_INTERVAL_DAYS)) {
      throw new ApiError(400, `Kies een aantal dagen tussen 1 en ${MAX_INTERVAL_DAYS}, of laat het leeg voor geen herinnering.`);
    }
  }
  const before = Object.fromEntries((await prisma.commercialContactRule.findMany()).map((r) => [r.tier, r.intervalDays]));
  await prisma.$transaction(
    input.map((r) =>
      r.intervalDays == null
        ? prisma.commercialContactRule.deleteMany({ where: { tier: r.tier } })
        : prisma.commercialContactRule.upsert({ where: { tier: r.tier }, create: { tier: r.tier, intervalDays: r.intervalDays, updatedById: ctx.userId }, update: { intervalDays: r.intervalDays, updatedById: ctx.userId } }),
    ),
  );
  const after = Object.fromEntries((await prisma.commercialContactRule.findMany()).map((r) => [r.tier, r.intervalDays]));
  await auditRecord(ctx, { action: "contact_rules.update", entity: "contact_rules", entityId: "contactmomenten", before, after });
}
