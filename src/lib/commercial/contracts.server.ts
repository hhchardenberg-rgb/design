import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { auditRecord, need, notFound, type RecordCtx } from "./ctx.server";
import { visibleCompany } from "./companies.server";
import { companyScopeWhere } from "./scope";

export const SEASON_STATUSES = ["DRAFT", "ACTIVE", "CLOSED"] as const;
export const CONTRACT_STATUSES = ["DRAFT", "ACTIVE", "ENDED", "CANCELLED"] as const;
export const COUNTERPART_STATUSES = ["PLANNED", "IN_PROGRESS", "DELIVERED", "CANCELLED"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** 'JJJJ-MM-DD' naar een datum zonder tijdzone-verschuiving. */
export function dateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, "Gebruik een datum in de vorm JJJJ-MM-DD.");
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, "Ongeldige datum.");
  return d;
}
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Bedragen zijn financiële gegevens: zonder leesrecht op 'amounts' worden ze overal weggelaten. */
const canSeeAmounts = (ctx: RecordCtx) => ctx.can("amounts:read");
const cents = (n: number | null | undefined) => {
  if (n == null) return null;
  if (!Number.isInteger(n) || n < 0 || n > 100_000_000_00) throw new ApiError(400, "Ongeldig bedrag.");
  return n;
};

// --- Seizoenen ---------------------------------------------------------------

export async function listSeasons(ctx: RecordCtx) {
  need(ctx, "contracts:read");
  const rows = await prisma.commercialSeason.findMany({ where: { archivedAt: null }, orderBy: { startsOn: "desc" } });
  return rows.map((s) => ({ id: s.id, name: s.name, startsOn: iso(s.startsOn), endsOn: iso(s.endsOn), status: s.status }));
}

export async function saveSeason(ctx: RecordCtx, id: string | null, input: { name: string; startsOn: string; endsOn: string; status?: string }) {
  need(ctx, "settings:manage_settings");
  const name = input.name.trim();
  if (!name) throw new ApiError(400, "Geef het seizoen een naam.");
  const startsOn = dateOnly(input.startsOn)!;
  const endsOn = dateOnly(input.endsOn)!;
  if (endsOn < startsOn) throw new ApiError(400, "De einddatum ligt voor de startdatum.");
  const status = input.status ?? "DRAFT";
  if (!(SEASON_STATUSES as readonly string[]).includes(status)) throw new ApiError(400, "Onbekende status.");
  const clash = await prisma.commercialSeason.findFirst({ where: { name, id: id ? { not: id } : undefined } });
  if (clash) throw new ApiError(409, "Er bestaat al een seizoen met deze naam.");
  const row = id
    ? await prisma.commercialSeason.update({ where: { id }, data: { name, startsOn, endsOn, status } })
    : await prisma.commercialSeason.create({ data: { name, startsOn, endsOn, status } });
  await auditRecord(ctx, { action: id ? "season.update" : "season.create", entity: "season", entityId: row.id });
  return row.id;
}

// --- Pakketten ---------------------------------------------------------------

export interface PackageInput {
  name: string;
  description?: string | null;
  defaultAmountCents?: number | null;
  items?: { title: string; description?: string | null; quantity?: number }[];
}

export async function listPackages(ctx: RecordCtx) {
  need(ctx, "contracts:read");
  const rows = await prisma.commercialPackage.findMany({ where: { archivedAt: null }, include: { items: { orderBy: { position: "asc" } } }, orderBy: { name: "asc" } });
  const amounts = canSeeAmounts(ctx);
  return rows.map((p) => ({
    id: p.id, name: p.name, description: p.description,
    defaultAmountCents: amounts ? p.defaultAmountCents : null,
    items: p.items.map((i) => ({ title: i.title, description: i.description, quantity: i.quantity })),
  }));
}

export async function savePackage(ctx: RecordCtx, id: string | null, input: PackageInput) {
  need(ctx, "settings:manage_settings");
  const name = input.name.trim();
  if (!name) throw new ApiError(400, "Geef het pakket een naam.");
  const items = (input.items ?? []).map((i, position) => {
    if (!i.title.trim()) throw new ApiError(400, "Elke tegenprestatie heeft een titel nodig.");
    return { title: i.title.trim(), description: i.description?.trim() || null, quantity: Math.min(Math.max(i.quantity ?? 1, 1), 999), position };
  });
  // Het standaardbedrag is een financieel gegeven: aanpassen vereist bedragenrechten.
  let amountPatch: { defaultAmountCents?: number | null } = {};
  if (input.defaultAmountCents !== undefined) {
    need(ctx, "amounts:update");
    amountPatch = { defaultAmountCents: cents(input.defaultAmountCents) };
  }
  const row = await prisma.$transaction(async (tx) => {
    if (id) {
      if (!(await tx.commercialPackage.findUnique({ where: { id } }))) notFound("Pakket");
      await tx.commercialPackageItem.deleteMany({ where: { packageId: id } });
    }
    const data = { name, description: input.description?.trim() || null, ...amountPatch, items: { create: items } };
    return id ? tx.commercialPackage.update({ where: { id }, data }) : tx.commercialPackage.create({ data });
  });
  await auditRecord(ctx, { action: id ? "package.update" : "package.create", entity: "package", entityId: row.id });
  return row.id;
}

export async function archivePackage(ctx: RecordCtx, id: string) {
  need(ctx, "settings:manage_settings");
  await prisma.commercialPackage.update({ where: { id }, data: { archivedAt: new Date() } });
  await auditRecord(ctx, { action: "package.archive", entity: "package", entityId: id });
}

/** Momentopname van een pakket voor in het contract; bevat bewust geen bedragen. */
async function snapshotOf(packageId: string | null) {
  if (!packageId) return null;
  const p = await prisma.commercialPackage.findUnique({ where: { id: packageId }, include: { items: { orderBy: { position: "asc" } } } });
  if (!p || p.archivedAt) throw new ApiError(400, "Dit pakket bestaat niet of is gearchiveerd.");
  return { capturedAt: new Date().toISOString(), packageId: p.id, name: p.name, description: p.description, items: p.items.map((i) => ({ title: i.title, description: i.description, quantity: i.quantity })) };
}
type Snapshot = NonNullable<Awaited<ReturnType<typeof snapshotOf>>>;

// --- Contracten --------------------------------------------------------------

type ContractRow = Prisma.CommercialContractGetPayload<{ include: { season: true; package: true; company: { select: { name: true } } } }>;
function present(ctx: RecordCtx, c: ContractRow) {
  return {
    id: c.id, companyId: c.companyId, companyName: c.company.name, seasonId: c.seasonId, seasonName: c.season.name,
    packageId: c.packageId, packageName: c.package?.name ?? (c.packageSnapshot as Snapshot | null)?.name ?? null,
    status: c.status, startsOn: iso(c.startsOn), endsOn: iso(c.endsOn), renewalOn: iso(c.renewalOn), noticeUntil: iso(c.noticeUntil),
    autoRenew: c.autoRenew, notes: c.notes, packageSnapshot: c.packageSnapshot, renewedFromId: c.renewedFromId,
    version: c.version, archivedAt: c.archivedAt,
    amountVisible: canSeeAmounts(ctx),
    amountCents: canSeeAmounts(ctx) ? c.amountCents : null,
  };
}
const INCLUDE = { season: true, package: true, company: { select: { name: true } } } as const;

async function visibleContract(ctx: RecordCtx, id: string) {
  const c = await prisma.commercialContract.findUnique({ where: { id }, include: INCLUDE });
  if (!c) notFound("Contract");
  await visibleCompany(ctx, c.companyId);
  return c;
}

export interface ContractListQuery {
  companyId?: string;
  seasonId?: string;
  status?: ContractStatus;
  /** Contracten die binnen dit aantal dagen aflopen of opgezegd moeten worden. */
  expiringWithinDays?: number;
  page?: number;
  pageSize?: number;
}

export async function listContracts(ctx: RecordCtx, q: ContractListQuery) {
  need(ctx, "contracts:read");
  if (q.companyId) await visibleCompany(ctx, q.companyId);
  const horizon = q.expiringWithinDays ? new Date(Date.now() + q.expiringWithinDays * 86_400_000) : null;
  const where: Prisma.CommercialContractWhereInput = {
    archivedAt: null,
    company: companyScopeWhere(ctx.scope("companies"), ctx.viewer),
    ...(q.companyId ? { companyId: q.companyId } : {}),
    ...(q.seasonId ? { seasonId: q.seasonId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(horizon ? { status: "ACTIVE", OR: [{ endsOn: { lte: horizon } }, { noticeUntil: { lte: horizon, gte: new Date() } }] } : {}),
  };
  const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), 100);
  const page = Math.max(q.page ?? 1, 1);
  const [total, rows] = await Promise.all([
    prisma.commercialContract.count({ where }),
    prisma.commercialContract.findMany({ where, include: INCLUDE, orderBy: [{ endsOn: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, page, pageSize, rows: rows.map((r) => present(ctx, r)) };
}

export interface ContractInput {
  seasonId: string;
  packageId?: string | null;
  startsOn: string;
  endsOn: string;
  amountCents?: number | null;
  renewalOn?: string | null;
  noticeUntil?: string | null;
  autoRenew?: boolean;
  notes?: string | null;
}

async function checkSeasonAndDates(seasonId: string, startsOn: Date, endsOn: Date) {
  const season = await prisma.commercialSeason.findUnique({ where: { id: seasonId } });
  if (!season || season.archivedAt) throw new ApiError(400, "Dit seizoen bestaat niet of is gearchiveerd.");
  if (season.status === "CLOSED") throw new ApiError(409, "Dit seizoen is afgesloten.");
  if (endsOn < startsOn) throw new ApiError(400, "De einddatum ligt voor de startdatum.");
}

export async function createContract(ctx: RecordCtx, companyId: string, input: ContractInput) {
  need(ctx, "contracts:create");
  const company = await visibleCompany(ctx, companyId);
  if (company.archivedAt) throw new ApiError(409, "Dit dossier is gearchiveerd.");
  const startsOn = dateOnly(input.startsOn)!, endsOn = dateOnly(input.endsOn)!;
  await checkSeasonAndDates(input.seasonId, startsOn, endsOn);
  if (input.amountCents !== undefined && input.amountCents !== null) need(ctx, "amounts:update");
  const amountCents = input.amountCents == null ? null : cents(input.amountCents);
  const snapshot = await snapshotOf(input.packageId ?? null);
  const contract = await prisma.$transaction(async (tx) => {
    const c = await tx.commercialContract.create({
      data: {
        companyId, seasonId: input.seasonId, packageId: input.packageId ?? null, startsOn, endsOn, amountCents,
        renewalOn: dateOnly(input.renewalOn), noticeUntil: dateOnly(input.noticeUntil), autoRenew: !!input.autoRenew,
        notes: input.notes?.trim() || null, packageSnapshot: snapshot ?? undefined, createdById: ctx.userId,
      },
    });
    if (snapshot) {
      await tx.commercialCounterpart.createMany({
        data: snapshot.items.map((i) => ({ contractId: c.id, companyId, title: i.title, description: i.description, quantity: i.quantity })),
      });
    }
    return c;
  });
  await auditRecord(ctx, { action: "contract.create", entity: "contract", entityId: contract.id, after: { companyId, seasonId: input.seasonId } });
  return contract.id;
}

export async function getContract(ctx: RecordCtx, id: string) {
  need(ctx, "contracts:read");
  return present(ctx, await visibleContract(ctx, id));
}

export async function updateContract(ctx: RecordCtx, id: string, input: Partial<ContractInput> & { version: number }) {
  need(ctx, "contracts:update");
  const cur = await visibleContract(ctx, id);
  if (cur.status === "ENDED" || cur.status === "CANCELLED") throw new ApiError(409, "Een beëindigd of geannuleerd contract kan niet meer worden gewijzigd.");
  const locked = cur.status === "ACTIVE";
  // Een lopend contract is een afspraak: seizoen en pakket staan vast, dan hoort er een verlenging of nieuw contract bij.
  if (locked && ((input.seasonId && input.seasonId !== cur.seasonId) || (input.packageId !== undefined && input.packageId !== cur.packageId))) {
    throw new ApiError(409, "Seizoen en pakket van een lopend contract staan vast. Maak een nieuw contract of een verlenging.");
  }
  const startsOn = input.startsOn ? dateOnly(input.startsOn)! : cur.startsOn;
  const endsOn = input.endsOn ? dateOnly(input.endsOn)! : cur.endsOn;
  await checkSeasonAndDates(input.seasonId ?? cur.seasonId, startsOn, endsOn);
  const amountChanged = input.amountCents !== undefined && input.amountCents !== cur.amountCents;
  if (amountChanged) need(ctx, "amounts:update");
  const packageChanged = input.packageId !== undefined && input.packageId !== cur.packageId;
  const snapshot = packageChanged ? await snapshotOf(input.packageId ?? null) : undefined;

  await prisma.$transaction(async (tx) => {
    const r = await tx.commercialContract.updateMany({
      where: { id, version: input.version },
      data: {
        seasonId: input.seasonId, packageId: packageChanged ? input.packageId : undefined, startsOn, endsOn,
        amountCents: amountChanged ? cents(input.amountCents) : undefined,
        renewalOn: input.renewalOn !== undefined ? dateOnly(input.renewalOn) : undefined,
        noticeUntil: input.noticeUntil !== undefined ? dateOnly(input.noticeUntil) : undefined,
        autoRenew: input.autoRenew, notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
        packageSnapshot: packageChanged ? (snapshot ?? Prisma.DbNull) : undefined,
        version: { increment: 1 },
      },
    });
    if (r.count === 0) throw new ApiError(409, "Dit contract is intussen door iemand anders gewijzigd. Laad het opnieuw en probeer het nog eens.");
    if (packageChanged) {
      // Alleen nog niet gestarte tegenprestaties worden vervangen; geleverde of lopende blijven staan.
      await tx.commercialCounterpart.deleteMany({ where: { contractId: id, status: "PLANNED" } });
      if (snapshot) await tx.commercialCounterpart.createMany({ data: snapshot.items.map((i) => ({ contractId: id, companyId: cur.companyId, title: i.title, description: i.description, quantity: i.quantity })) });
    }
  });
  // Bedragen zelf komen niet in het auditlog (dat is breder leesbaar dan de financiële gegevens); alleen dát ze wijzigden.
  await auditRecord(ctx, { action: "contract.update", entity: "contract", entityId: id, after: { amountChanged, packageChanged } });
  return getContract(ctx, id);
}

const TRANSITIONS: Record<string, ContractStatus[]> = { DRAFT: ["ACTIVE", "CANCELLED"], ACTIVE: ["ENDED", "CANCELLED"], ENDED: [], CANCELLED: [] };

export async function setContractStatus(ctx: RecordCtx, id: string, to: ContractStatus) {
  need(ctx, to === "ACTIVE" ? "contracts:approve" : "contracts:update");
  const cur = await visibleContract(ctx, id);
  if (!TRANSITIONS[cur.status]?.includes(to)) throw new ApiError(409, "Deze statuswijziging is niet mogelijk.");
  if (to === "ACTIVE" && (!cur.packageId && !cur.packageSnapshot)) throw new ApiError(409, "Kies eerst een pakket voordat je het contract activeert.");
  const r = await prisma.commercialContract.updateMany({ where: { id, status: cur.status }, data: { status: to, version: { increment: 1 } } });
  if (r.count === 0) throw new ApiError(409, "De status is intussen gewijzigd. Laad het contract opnieuw.");
  if (to === "CANCELLED") await prisma.commercialCounterpart.updateMany({ where: { contractId: id, status: { in: ["PLANNED", "IN_PROGRESS"] } }, data: { status: "CANCELLED" } });
  await auditRecord(ctx, { action: "contract.status", entity: "contract", entityId: id, before: { status: cur.status }, after: { status: to } });
  return getContract(ctx, id);
}

/** Maakt een concept-verlenging voor een volgend seizoen; het pakket wordt opnieuw vastgelegd, het bedrag alleen meegenomen met bedragenrechten. */
export async function renewContract(ctx: RecordCtx, id: string, input: { seasonId: string; startsOn: string; endsOn: string }) {
  need(ctx, "contracts:create");
  const cur = await visibleContract(ctx, id);
  if (cur.status !== "ACTIVE" && cur.status !== "ENDED") throw new ApiError(409, "Alleen een lopend of afgelopen contract kan worden verlengd.");
  if (input.seasonId === cur.seasonId) throw new ApiError(400, "Kies een ander seizoen voor de verlenging.");
  if (await prisma.commercialContract.findFirst({ where: { renewedFromId: id, archivedAt: null, status: { not: "CANCELLED" } } })) {
    throw new ApiError(409, "Dit contract is al verlengd.");
  }
  const newId = await createContract(ctx, cur.companyId, {
    seasonId: input.seasonId, packageId: cur.package && !cur.package.archivedAt ? cur.packageId : null,
    startsOn: input.startsOn, endsOn: input.endsOn, autoRenew: cur.autoRenew,
    ...(canSeeAmounts(ctx) && ctx.can("amounts:update") ? { amountCents: cur.amountCents } : {}),
  });
  await prisma.commercialContract.update({ where: { id: newId }, data: { renewedFromId: id } });
  await auditRecord(ctx, { action: "contract.renew", entity: "contract", entityId: newId, before: { renewedFromId: id } });
  return newId;
}

// --- Tegenprestaties ---------------------------------------------------------

export async function listCounterparts(ctx: RecordCtx, contractId: string) {
  need(ctx, "counterparts:read");
  await visibleContract(ctx, contractId);
  const rows = await prisma.commercialCounterpart.findMany({ where: { contractId }, orderBy: [{ createdAt: "asc" }] });
  return rows.map((r) => ({ id: r.id, title: r.title, description: r.description, quantity: r.quantity, status: r.status, dueOn: iso(r.dueOn), deliveredAt: r.deliveredAt, notes: r.notes }));
}

export async function addCounterpart(ctx: RecordCtx, contractId: string, input: { title: string; description?: string | null; quantity?: number; dueOn?: string | null }) {
  need(ctx, "counterparts:create");
  const c = await visibleContract(ctx, contractId);
  if (c.status === "CANCELLED") throw new ApiError(409, "Dit contract is geannuleerd.");
  if (!input.title.trim()) throw new ApiError(400, "Geef de tegenprestatie een titel.");
  const row = await prisma.commercialCounterpart.create({
    data: { contractId, companyId: c.companyId, title: input.title.trim(), description: input.description?.trim() || null, quantity: Math.min(Math.max(input.quantity ?? 1, 1), 999), dueOn: dateOnly(input.dueOn) },
  });
  await auditRecord(ctx, { action: "counterpart.create", entity: "counterpart", entityId: row.id });
  return row.id;
}

export async function updateCounterpart(ctx: RecordCtx, id: string, input: { status?: string; dueOn?: string | null; notes?: string | null; description?: string | null }) {
  need(ctx, "counterparts:update");
  const cp = await prisma.commercialCounterpart.findUnique({ where: { id } });
  if (!cp) notFound("Tegenprestatie");
  await visibleCompany(ctx, cp.companyId);
  if (input.status && !(COUNTERPART_STATUSES as readonly string[]).includes(input.status)) throw new ApiError(400, "Onbekende status.");
  await prisma.commercialCounterpart.update({
    where: { id },
    data: {
      status: input.status,
      deliveredAt: input.status === "DELIVERED" ? new Date() : input.status ? null : undefined,
      dueOn: input.dueOn !== undefined ? dateOnly(input.dueOn) : undefined,
      notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
      description: input.description === undefined ? undefined : input.description?.trim() || null,
    },
  });
  if (input.status && input.status !== cp.status) await auditRecord(ctx, { action: "counterpart.status", entity: "counterpart", entityId: id, before: { status: cp.status }, after: { status: input.status } });
}
