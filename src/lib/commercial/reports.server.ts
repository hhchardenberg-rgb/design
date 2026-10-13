import { prisma } from "@/lib/prisma";
import { auditRecord, need, type RecordCtx } from "./ctx.server";
import { csvSafeCell } from "./csv";
import { companyScopeWhere } from "./scope";
import { ApiError } from "@/lib/api-guards";
import { SPONSOR_TIERS, tierLabel } from "./sponsor-tiers";
import { buildXlsx } from "./xlsx";
import { CONTACT_ORDER } from "./companies.server";

const CONTRACT_STATUSES = ["ACTIVE", "DRAFT", "ENDED", "CANCELLED"] as const;
const STAGES = ["LEAD", "CONTACTED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;

/** Bedragen alleen met bedragenrecht; anders null, ook in totalen, zodat niets uit verschillen af te leiden is. */
const sum = (ctx: RecordCtx, values: Array<number | null>) => (ctx.can("amounts:read") ? values.reduce<number>((a, v) => a + (v ?? 0), 0) : null);

export async function seasonReport(ctx: RecordCtx, seasonId: string) {
  need(ctx, "reports:read");
  need(ctx, "contracts:read");
  const season = await prisma.commercialSeason.findUnique({ where: { id: seasonId } });
  if (!season) throw new ApiError(404, "Seizoen niet gevonden.");
  const companyWhere = companyScopeWhere(ctx.scope("companies"), ctx.viewer);
  const contracts = await prisma.commercialContract.findMany({
    where: { seasonId, archivedAt: null, company: companyWhere },
    include: { package: { select: { name: true } }, company: { select: { sponsorTier: true } } },
  });
  const byStatus = CONTRACT_STATUSES.map((status) => {
    const rows = contracts.filter((c) => c.status === status);
    return { status, count: rows.length, totalCents: sum(ctx, rows.map((r) => r.amountCents)) };
  });
  const active = contracts.filter((c) => c.status === "ACTIVE");
  const groups = new Map<string, typeof active>();
  for (const c of active) {
    const name = c.package?.name ?? ((c.packageSnapshot as { name?: string } | null)?.name) ?? "Zonder pakket";
    groups.set(name, [...(groups.get(name) ?? []), c]);
  }
  const byPackage = [...groups.entries()]
    .map(([name, rows]) => ({ name, count: rows.length, totalCents: sum(ctx, rows.map((r) => r.amountCents)) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const byTier = [...SPONSOR_TIERS.map((t) => t.key as string), "NONE"]
    .map((key) => {
      const rows = active.filter((c) => (c.company.sponsorTier ?? "NONE") === key);
      return { key, name: key === "NONE" ? "Zonder vorm" : (tierLabel(key) ?? key), count: rows.length, totalCents: sum(ctx, rows.map((r) => r.amountCents)) };
    })
    .filter((t) => t.count > 0);
  const withoutAmount = ctx.can("amounts:read") ? active.filter((c) => c.amountCents == null).length : null;
  return { season: { id: season.id, name: season.name }, byStatus, byPackage, byTier, activeWithoutAmount: withoutAmount };
}

export async function pipelineReport(ctx: RecordCtx) {
  need(ctx, "reports:read");
  need(ctx, "opportunities:read");
  const rows = await prisma.commercialOpportunity.findMany({
    where: { archivedAt: null, company: companyScopeWhere(ctx.scope("companies"), ctx.viewer) },
    select: { stage: true, expectedAmountCents: true },
  });
  return {
    stages: STAGES.map((stage) => {
      const r = rows.filter((x) => x.stage === stage);
      return { stage, count: r.length, expectedCents: sum(ctx, r.map((x) => x.expectedAmountCents)) };
    }),
  };
}

function csvLine(cells: Array<string | number | null | undefined>): string {
  return cells
    .map((c) => {
      const v = csvSafeCell(c == null ? "" : String(c));
      return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    })
    .join(";");
}
const euro = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** Puntkomma en BOM: opent direct goed in Nederlandse Excel. Export vereist een eigen bevoegdheid en wordt gelogd. */
function finish(lines: string[]) {
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export async function exportContractsCsv(ctx: RecordCtx, seasonId?: string) {
  need(ctx, "exports:export");
  need(ctx, "contracts:read");
  const amounts = ctx.can("amounts:read");
  const rows = await prisma.commercialContract.findMany({
    where: { archivedAt: null, ...(seasonId ? { seasonId } : {}), company: companyScopeWhere(ctx.scope("companies"), ctx.viewer) },
    include: { company: { select: { name: true, sponsorTier: true } }, season: { select: { name: true } }, package: { select: { name: true } } },
    orderBy: [{ season: { name: "asc" } }, { company: { name: "asc" } }],
  });
  const header = ["Sponsor", "Sponsorvorm", "Seizoen", "Pakket", "Status", "Start", "Einde", "Opzegdatum", ...(amounts ? ["Bedrag (excl. btw)"] : [])];
  const lines = [csvLine(header), ...rows.map((c) => csvLine([c.company.name, tierLabel(c.company.sponsorTier) ?? "", c.season.name, c.package?.name ?? "", c.status, day(c.startsOn), day(c.endsOn), day(c.noticeUntil), ...(amounts ? [euro(c.amountCents)] : [])]))];
  await auditRecord(ctx, { action: "export.contracts", entity: "export", entityId: seasonId ?? "alle", after: { rows: rows.length, withAmounts: amounts } });
  return finish(lines);
}

export async function exportCompaniesCsv(ctx: RecordCtx) {
  need(ctx, "exports:export");
  need(ctx, "companies:read");
  const rows = await prisma.commercialCompany.findMany({
    where: { archivedAt: null, ...companyScopeWhere(ctx.scope("companies"), ctx.viewer) },
    orderBy: { name: "asc" },
  });
  // Bewust zonder interne notities, KvK/btw en factuurgegevens.
  const lines = [csvLine(["Naam", "Handelsnaam", "Status", "Plaats", "Branche", "Sponsorvorm", "Categorie", "E-mail", "Telefoon", "Website"]), ...rows.map((c) => csvLine([c.name, c.tradeName, c.status, c.city, c.industry, tierLabel(c.sponsorTier) ?? "", c.sponsorCategory, c.email, c.phone, c.website]))];
  await auditRecord(ctx, { action: "export.companies", entity: "export", entityId: "dossiers", after: { rows: rows.length } });
  return finish(lines);
}


const COMPANY_STATUS_LABEL: Record<string, string> = { PROSPECT: "Potentieel", ACTIVE: "Actief", FORMER: "Voormalig" };
/** Filterwaarde voor bedrijven zonder sponsorvorm. */
export const NO_TIER = "NONE";

/**
 * Excel-export van alle bedrijven met hun contactpersonen, optioneel gefilterd op sponsorvorm(en).
 * Blad 1: één rij per bedrijf met contact 1, contact 2, ... naast elkaar (volgorde uit het dossier).
 * Blad 2: één rij per contactpersoon, handig voor mailen of samenvoegen.
 */
export async function exportCompanyContactsXlsx(ctx: RecordCtx, tiers: string[] = []) {
  need(ctx, "exports:export");
  need(ctx, "companies:read");
  need(ctx, "contacts:read");
  const known = tiers.filter((t) => t === NO_TIER || SPONSOR_TIERS.some((s) => s.key === t));
  const tierWhere = known.length
    ? { OR: [...(known.some((t) => t !== NO_TIER) ? [{ sponsorTier: { in: known.filter((t) => t !== NO_TIER) } }] : []), ...(known.includes(NO_TIER) ? [{ sponsorTier: null }] : [])] }
    : {};
  const rows = await prisma.commercialCompany.findMany({
    where: { archivedAt: null, ...companyScopeWhere(ctx.scope("companies"), ctx.viewer), ...tierWhere },
    include: { contacts: { where: { archivedAt: null }, orderBy: CONTACT_ORDER } },
    orderBy: { name: "asc" },
  });
  const tierRank = (t: string | null) => { const i = SPONSOR_TIERS.findIndex((s) => s.key === t); return i < 0 ? SPONSOR_TIERS.length : i; };
  rows.sort((a, b) => tierRank(a.sponsorTier) - tierRank(b.sponsorTier) || a.name.localeCompare(b.name, "nl"));

  const maxContacts = Math.max(1, ...rows.map((r) => r.contacts.length));
  const base = ["Bedrijf", "Handelsnaam", "Sponsorvorm", "Status", "Plaats", "E-mail bedrijf", "Telefoon bedrijf", "Aantal contactpersonen"];
  const header = [...base, ...Array.from({ length: maxContacts }, (_, i) => [`Contact ${i + 1} naam`, `Contact ${i + 1} functie`, `Contact ${i + 1} e-mail`, `Contact ${i + 1} telefoon`]).flat()];
  const companySheet = rows.map((c) => [
    c.name, c.tradeName, tierLabel(c.sponsorTier) ?? "", COMPANY_STATUS_LABEL[c.status] ?? c.status, c.city, c.email, c.phone, String(c.contacts.length),
    ...c.contacts.flatMap((p) => [p.name, p.jobTitle, p.email, p.phone]),
  ]);
  const personSheet = rows.flatMap((c) => c.contacts.map((p, i) => [c.name, tierLabel(c.sponsorTier) ?? "", String(i + 1), p.name, p.jobTitle, p.email, p.phone, p.role]));

  const file = await buildXlsx([
    { name: "Bedrijven", header, rows: companySheet },
    { name: "Contactpersonen", header: ["Bedrijf", "Sponsorvorm", "Volgorde", "Naam", "Functie", "E-mail", "Telefoon", "Contactrol"], rows: personSheet },
  ]);
  await auditRecord(ctx, { action: "export.contacts", entity: "export", entityId: known.length ? known.join(",") : "alle", after: { companies: rows.length, contacts: personSheet.length } });
  return file;
}
