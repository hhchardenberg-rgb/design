import { prisma } from "@/lib/prisma";
import { auditRecord, need, type RecordCtx } from "./ctx.server";
import { csvSafeCell } from "./csv";
import { companyScopeWhere } from "./scope";
import { ApiError } from "@/lib/api-guards";

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
    include: { package: { select: { name: true } } },
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
  const withoutAmount = ctx.can("amounts:read") ? active.filter((c) => c.amountCents == null).length : null;
  return { season: { id: season.id, name: season.name }, byStatus, byPackage, activeWithoutAmount: withoutAmount };
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
    include: { company: { select: { name: true } }, season: { select: { name: true } }, package: { select: { name: true } } },
    orderBy: [{ season: { name: "asc" } }, { company: { name: "asc" } }],
  });
  const header = ["Sponsor", "Seizoen", "Pakket", "Status", "Start", "Einde", "Opzegdatum", ...(amounts ? ["Bedrag (excl. btw)"] : [])];
  const lines = [csvLine(header), ...rows.map((c) => csvLine([c.company.name, c.season.name, c.package?.name ?? "", c.status, day(c.startsOn), day(c.endsOn), day(c.noticeUntil), ...(amounts ? [euro(c.amountCents)] : [])]))];
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
  const lines = [csvLine(["Naam", "Handelsnaam", "Status", "Plaats", "Branche", "Categorie", "E-mail", "Telefoon", "Website"]), ...rows.map((c) => csvLine([c.name, c.tradeName, c.status, c.city, c.industry, c.sponsorCategory, c.email, c.phone, c.website]))];
  await auditRecord(ctx, { action: "export.companies", entity: "export", entityId: "dossiers", after: { rows: rows.length } });
  return finish(lines);
}

