import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { CLUB_TIME_ZONE } from "@/lib/timezone";
import { auditRecord, need, type RecordCtx } from "./ctx.server";
import { companyScopeWhere } from "./scope";
import { visibleCompany } from "./companies.server";
import {
  addDays, formatDocumentNumber, isValidDutchVatNumber, isValidIban, isValidKvk, normalizeVatNumber, totalsOf, VAT_RATES_BP,
} from "./invoice-math";

export const SETTINGS_ID = "singleton";

/** Bekende gegevens van HHC; alles hiervan is in de instellingen te wijzigen. Btw, IBAN, termijn en nummering blijven bewust leeg. */
export const SETTINGS_DEFAULTS = {
  legalName: "Voetbalvereniging HHC Hardenberg",
  street: "De Boshoek 5",
  postalCode: "7771 RH",
  city: "Hardenberg",
  kvkNumber: "05026683",
  vatNumber: null,
  iban: null,
  paymentTermDays: null,
  invoicePrefix: null,
  nextInvoiceNumber: null,
  creditPrefix: null,
  nextCreditNumber: null,
} as const;

export interface SettingsInput {
  legalName: string | null; street: string | null; postalCode: string | null; city: string | null; kvkNumber: string | null;
  vatNumber: string | null; iban: string | null; paymentTermDays: number | null;
  invoicePrefix: string | null; nextInvoiceNumber: number | null; creditPrefix: string | null; nextCreditNumber: number | null;
  version: number;
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: CLUB_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const trim = (v: string | null | undefined) => (v == null || v.trim() === "" ? null : v.trim());

export async function getInvoiceSettings(ctx: RecordCtx) {
  need(ctx, "settings:read");
  const row = await prisma.commercialInvoiceSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) return { ...SETTINGS_DEFAULTS, version: 0, saved: false };
  return {
    legalName: row.legalName, street: row.street, postalCode: row.postalCode, city: row.city, kvkNumber: row.kvkNumber,
    vatNumber: row.vatNumber, iban: row.iban, paymentTermDays: row.paymentTermDays,
    invoicePrefix: row.invoicePrefix, nextInvoiceNumber: row.nextInvoiceNumber, creditPrefix: row.creditPrefix, nextCreditNumber: row.nextCreditNumber,
    version: row.version, saved: true,
  };
}

export async function saveInvoiceSettings(ctx: RecordCtx, input: SettingsInput) {
  need(ctx, "settings:manage_settings");
  const v = {
    legalName: trim(input.legalName), street: trim(input.street), postalCode: trim(input.postalCode), city: trim(input.city),
    kvkNumber: trim(input.kvkNumber), vatNumber: trim(input.vatNumber), iban: trim(input.iban),
    invoicePrefix: input.invoicePrefix?.trim() || null, creditPrefix: input.creditPrefix?.trim() || null,
  };
  if (v.kvkNumber && !isValidKvk(v.kvkNumber)) throw new ApiError(400, "Een KvK-nummer bestaat uit 8 cijfers.");
  if (v.vatNumber && !isValidDutchVatNumber(v.vatNumber)) throw new ApiError(400, "Een btw-identificatienummer ziet eruit als NL123456789B01.");
  if (v.iban && !isValidIban(v.iban)) throw new ApiError(400, "Dit IBAN is niet geldig. Controleer het nummer.");
  const term = input.paymentTermDays;
  if (term != null && (!Number.isInteger(term) || term < 0 || term > 120)) throw new ApiError(400, "De betalingstermijn is 0 tot 120 dagen.");
  for (const n of [input.nextInvoiceNumber, input.nextCreditNumber]) {
    if (n != null && (!Number.isInteger(n) || n < 1 || n > 99_999_999)) throw new ApiError(400, "Een volgnummer is een geheel getal vanaf 1.");
  }
  for (const p of [v.invoicePrefix, v.creditPrefix]) if (p && (p.length > 20 || /[\s/\\]/.test(p))) throw new ApiError(400, "Een nummervoorvoegsel is maximaal 20 tekens zonder spaties of schuine strepen.");
  if (v.invoicePrefix && v.invoicePrefix === v.creditPrefix) throw new ApiError(400, "Facturen en creditnota's moeten een verschillend voorvoegsel hebben, anders kunnen nummers botsen.");

  const existing = await prisma.commercialInvoiceSettings.findUnique({ where: { id: SETTINGS_ID } });
  if ((existing?.version ?? 0) !== input.version) throw new ApiError(409, "De instellingen zijn intussen gewijzigd. Laad de pagina opnieuw.");
  // Het volgnummer mag nooit teruggezet worden onder wat al is uitgegeven.
  for (const [kind, next, current] of [["INVOICE", input.nextInvoiceNumber, existing?.nextInvoiceNumber], ["CREDIT_NOTE", input.nextCreditNumber, existing?.nextCreditNumber]] as const) {
    if (current != null && (next == null || next < current) && (await prisma.commercialInvoice.count({ where: { kind, status: "ISSUED" } })) > 0) {
      throw new ApiError(409, "Het volgnummer kan niet worden verlaagd of leeggemaakt nadat er documenten zijn uitgegeven.");
    }
  }
  const data = { ...v, paymentTermDays: term, nextInvoiceNumber: input.nextInvoiceNumber, nextCreditNumber: input.nextCreditNumber, updatedById: ctx.userId };
  if (existing) {
    const r = await prisma.commercialInvoiceSettings.updateMany({ where: { id: SETTINGS_ID, version: input.version }, data: { ...data, version: { increment: 1 } } });
    if (r.count === 0) throw new ApiError(409, "De instellingen zijn intussen gewijzigd. Laad de pagina opnieuw.");
  } else {
    try {
      await prisma.commercialInvoiceSettings.create({ data: { id: SETTINGS_ID, ...data } });
    } catch {
      throw new ApiError(409, "De instellingen zijn intussen gewijzigd. Laad de pagina opnieuw.");
    }
  }
  const changed = Object.keys(data).filter((k) => k !== "updatedById" && (existing as unknown as Record<string, unknown> | null)?.[k] !== (data as Record<string, unknown>)[k]);
  await auditRecord(ctx, { action: "invoice_settings.update", entity: "invoice_settings", entityId: SETTINGS_ID, after: { fields: changed } });
}

type Settings = Awaited<ReturnType<typeof getInvoiceSettings>>;

/** Wat er nog ontbreekt voordat een document definitief kan worden; leeg = klaar om uit te geven. */
export function missingForIssuing(s: Settings, kind: "INVOICE" | "CREDIT_NOTE"): string[] {
  const m: string[] = [];
  if (!s.legalName) m.push("naam van de vereniging");
  if (!s.street || !s.postalCode || !s.city) m.push("adres van de vereniging");
  if (!s.kvkNumber) m.push("KvK-nummer");
  if (!s.vatNumber) m.push("btw-identificatienummer");
  if (kind === "INVOICE") {
    if (!s.iban) m.push("IBAN");
    if (s.paymentTermDays == null) m.push("betalingstermijn");
  }
  if (kind === "INVOICE" ? s.nextInvoiceNumber == null : s.nextCreditNumber == null) m.push(kind === "INVOICE" ? "factuurnummering (volgnummer)" : "creditnotanummering (volgnummer)");
  return m;
}

// ---------- Documenten ----------

export interface LineInput { description: string; quantity?: number; unitCents: number; vatRateBp?: number | null }
export interface DraftInput {
  contractId?: string | null; buyerName?: string | null; buyerAddress?: string | null; buyerVatNumber?: string | null;
  reference?: string | null; deliveryText?: string | null; lines?: LineInput[];
}

function cleanLines(lines: LineInput[]) {
  if (lines.length > 50) throw new ApiError(400, "Maximaal 50 regels per document.");
  return lines.map((l, i) => {
    const description = l.description.trim();
    if (!description || description.length > 300) throw new ApiError(400, `Regel ${i + 1}: geef een omschrijving (maximaal 300 tekens).`);
    const quantity = l.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100_000) throw new ApiError(400, `Regel ${i + 1}: het aantal is een geheel getal vanaf 1.`);
    if (!Number.isInteger(l.unitCents) || l.unitCents < 0 || l.unitCents > 100_000_000_00) throw new ApiError(400, `Regel ${i + 1}: ongeldig bedrag.`);
    const vat = l.vatRateBp ?? null;
    if (vat != null && !(VAT_RATES_BP as readonly number[]).includes(vat)) throw new ApiError(400, `Regel ${i + 1}: kies 0%, 9% of 21% btw.`);
    return { position: i + 1, description, quantity, unitCents: l.unitCents, vatRateBp: vat };
  });
}

const INCLUDE = { lines: { orderBy: { position: "asc" } }, payments: { orderBy: { paidOn: "asc" } } } as const;
type Doc = Prisma.CommercialInvoiceGetPayload<{ include: typeof INCLUDE }>;

const permFor = (kind: string, action: "read" | "create" | "download" | "approve" | "send") => (kind === "CREDIT_NOTE" ? (`credit_notes:${action}` as const) : (`invoices:${action}` as const));

async function loadDoc(ctx: RecordCtx, id: string, action: "read" | "create" | "download" | "approve" | "send" = "read"): Promise<Doc> {
  const d = await prisma.commercialInvoice.findUnique({ where: { id }, include: INCLUDE });
  if (!d) throw new ApiError(404, "Document niet gevonden.");
  need(ctx, permFor(d.kind, action));
  await visibleCompany(ctx, d.companyId); // buiten bereik: 404
  return d;
}

async function creditedGross(invoiceId: string, onlyIssued = true): Promise<number> {
  const credits = await prisma.commercialInvoice.findMany({ where: { creditedInvoiceId: invoiceId, kind: "CREDIT_NOTE", ...(onlyIssued ? { status: "ISSUED" } : {}) }, include: { lines: true } });
  return credits.reduce((a, c) => a + totalsOf(c.lines).grossCents, 0);
}

function present(ctx: RecordCtx, d: Doc, credited: number) {
  const totals = totalsOf(d.lines);
  const sign = d.kind === "CREDIT_NOTE" ? -1 : 1;
  const canPay = ctx.can("payments:read");
  const paid = d.payments.filter((p) => !p.voidedAt).reduce((a, p) => a + p.amountCents, 0);
  return {
    id: d.id, kind: d.kind, status: d.status, companyId: d.companyId, contractId: d.contractId, creditedInvoiceId: d.creditedInvoiceId,
    number: d.number, issuedOn: iso(d.issuedOn), dueOn: iso(d.dueOn), deliveryText: d.deliveryText,
    buyerName: d.buyerName, buyerAddress: d.buyerAddress, buyerVatNumber: d.buyerVatNumber, reference: d.reference,
    version: d.version, createdAt: d.createdAt,
    lines: d.lines.map((l) => ({ id: l.id, description: l.description, quantity: l.quantity, unitCents: l.unitCents, vatRateBp: l.vatRateBp })),
    totals: { groups: totals.groups, netCents: sign * totals.netCents, vatCents: sign * totals.vatCents, grossCents: sign * totals.grossCents },
    creditedCents: d.kind === "INVOICE" ? credited : null,
    paidCents: d.kind === "INVOICE" && canPay ? paid : null,
    outstandingCents: d.kind === "INVOICE" && d.status === "ISSUED" && canPay ? totals.grossCents - credited - paid : null,
    payments: canPay ? d.payments.map((p) => ({ id: p.id, amountCents: p.amountCents, paidOn: iso(p.paidOn), note: p.note, voided: !!p.voidedAt })) : [],
  };
}

export async function listInvoices(ctx: RecordCtx, q: { companyId?: string; kind?: string; status?: string }) {
  const kinds = [ctx.can("invoices:read") ? "INVOICE" : null, ctx.can("credit_notes:read") ? "CREDIT_NOTE" : null].filter(Boolean) as string[];
  if (kinds.length === 0) need(ctx, "invoices:read");
  if (q.companyId) await visibleCompany(ctx, q.companyId);
  const rows = await prisma.commercialInvoice.findMany({
    where: {
      kind: { in: q.kind && kinds.includes(q.kind) ? [q.kind] : kinds },
      ...(q.status ? { status: q.status } : {}),
      companyId: q.companyId ?? { in: (await prisma.commercialCompany.findMany({ where: companyScopeWhere(ctx.scope("companies"), ctx.viewer), select: { id: true } })).map((c) => c.id) },
    },
    include: INCLUDE,
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  const names = new Map((await prisma.commercialCompany.findMany({ where: { id: { in: rows.map((r) => r.companyId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const out = [];
  for (const r of rows) out.push({ ...present(ctx, r, r.kind === "INVOICE" ? await creditedGross(r.id) : 0), companyName: names.get(r.companyId) ?? "" });
  return out;
}

export async function getInvoice(ctx: RecordCtx, id: string) {
  const d = await loadDoc(ctx, id);
  const company = await prisma.commercialCompany.findUnique({ where: { id: d.companyId }, select: { name: true } });
  return { ...present(ctx, d, d.kind === "INVOICE" ? await creditedGross(d.id) : 0), companyName: company?.name ?? "" };
}

export async function createInvoice(ctx: RecordCtx, companyId: string, input: DraftInput) {
  need(ctx, "invoices:create");
  const company = await visibleCompany(ctx, companyId);
  let lines = input.lines ?? [];
  let deliveryText = trim(input.deliveryText);
  let contractId: string | null = null;
  if (input.contractId) {
    need(ctx, "contracts:read");
    need(ctx, "amounts:read");
    const c = await prisma.commercialContract.findUnique({ where: { id: input.contractId }, include: { season: true, package: true } });
    if (!c || c.companyId !== companyId) throw new ApiError(400, "Dit contract hoort niet bij deze sponsor.");
    contractId = c.id;
    deliveryText ??= `Seizoen ${c.season.name}`;
    if (lines.length === 0 && c.amountCents != null) lines = [{ description: `Sponsoring ${c.season.name}${c.package?.name ? ` – ${c.package.name}` : ""}`, unitCents: c.amountCents, vatRateBp: null }];
  }
  const buyerName = trim(input.buyerName) ?? company.billingName ?? company.name;
  const address = trim(input.buyerAddress) ?? company.billingAddress ?? ([company.street, [company.postalCode, company.city].filter(Boolean).join(" ")].filter(Boolean).join("\n") || null);
  const d = await prisma.commercialInvoice.create({
    data: {
      kind: "INVOICE", companyId, contractId, buyerName, buyerAddress: address, buyerVatNumber: trim(input.buyerVatNumber) ? normalizeVatNumber(input.buyerVatNumber!) : null,
      reference: trim(input.reference), deliveryText, createdById: ctx.userId,
      lines: { create: cleanLines(lines) },
    },
  });
  await auditRecord(ctx, { action: "invoice.create", entity: "invoice", entityId: d.id });
  return d.id;
}

export async function updateInvoice(ctx: RecordCtx, id: string, input: DraftInput & { version: number }) {
  const d = await loadDoc(ctx, id);
  need(ctx, "invoices:update");
  if (d.kind !== "INVOICE") throw new ApiError(400, "Een creditnota kan niet worden bewerkt; maak een nieuwe aan.");
  if (d.status !== "DRAFT") throw new ApiError(409, "Een definitieve factuur kan niet meer worden gewijzigd. Corrigeer met een creditnota.");
  const lines = input.lines ? cleanLines(input.lines) : null;
  await prisma.$transaction(async (tx) => {
    const r = await tx.commercialInvoice.updateMany({
      where: { id, version: input.version, status: "DRAFT" },
      data: {
        ...(input.buyerName !== undefined ? { buyerName: trim(input.buyerName) ?? d.buyerName } : {}),
        ...(input.buyerAddress !== undefined ? { buyerAddress: trim(input.buyerAddress) } : {}),
        ...(input.buyerVatNumber !== undefined ? { buyerVatNumber: trim(input.buyerVatNumber) ? normalizeVatNumber(input.buyerVatNumber!) : null } : {}),
        ...(input.reference !== undefined ? { reference: trim(input.reference) } : {}),
        ...(input.deliveryText !== undefined ? { deliveryText: trim(input.deliveryText) } : {}),
        version: { increment: 1 },
      },
    });
    if (r.count === 0) throw new ApiError(409, "De factuur is intussen gewijzigd of definitief gemaakt. Laad de pagina opnieuw.");
    if (lines) {
      await tx.commercialInvoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.commercialInvoiceLine.createMany({ data: lines.map((l) => ({ ...l, invoiceId: id })) });
    }
  });
}

/** Verwijdert een concept (nog zonder nummer). Definitieve documenten blijven altijd bestaan. */
export async function discardDraft(ctx: RecordCtx, id: string) {
  const d = await loadDoc(ctx, id);
  need(ctx, d.kind === "CREDIT_NOTE" ? "credit_notes:create" : "invoices:update");
  if (d.status !== "DRAFT") throw new ApiError(409, "Een definitief document kan niet worden verwijderd.");
  await prisma.commercialInvoice.delete({ where: { id } });
  await auditRecord(ctx, { action: "invoice.discard", entity: "invoice", entityId: id });
}

export async function createCreditNote(ctx: RecordCtx, invoiceId: string, input: { reference?: string | null; lines?: LineInput[] }) {
  need(ctx, "credit_notes:create");
  const inv = await loadDoc(ctx, invoiceId, "read");
  if (inv.kind !== "INVOICE" || inv.status !== "ISSUED") throw new ApiError(409, "Alleen een definitieve factuur kan worden gecrediteerd.");
  const lines = cleanLines(input.lines ?? inv.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitCents: l.unitCents, vatRateBp: l.vatRateBp })));
  if (lines.length === 0 || lines.some((l) => l.vatRateBp == null)) throw new ApiError(400, "Geef minstens één regel met een btw-tarief.");
  const gross = totalsOf(lines).grossCents;
  const credited = await creditedGross(invoiceId, false); // ook concepten tellen mee: voorkomt dubbel crediteren
  if (gross <= 0) throw new ApiError(400, "Het bedrag van een creditnota moet groter zijn dan nul.");
  if (gross + credited > totalsOf(inv.lines).grossCents) throw new ApiError(400, "De creditnota(s) zouden samen meer bedragen dan de oorspronkelijke factuur.");
  const d = await prisma.commercialInvoice.create({
    data: {
      kind: "CREDIT_NOTE", companyId: inv.companyId, creditedInvoiceId: invoiceId, buyerName: inv.buyerName, buyerAddress: inv.buyerAddress, buyerVatNumber: inv.buyerVatNumber,
      reference: trim(input.reference), deliveryText: inv.deliveryText, createdById: ctx.userId, lines: { create: lines },
    },
  });
  await auditRecord(ctx, { action: "credit_note.create", entity: "invoice", entityId: d.id, after: { creditedInvoiceId: invoiceId } });
  return d.id;
}

/** Maakt een document definitief: nummer, datum en een vaste kopie van de afzendergegevens. */
export async function issueDocument(ctx: RecordCtx, id: string) {
  const d = await loadDoc(ctx, id, "approve");
  if (d.status !== "DRAFT") throw new ApiError(409, "Dit document is al definitief.");
  const settings = await getInvoiceSettingsForIssuing();
  const missing = missingForIssuing(settings, d.kind as "INVOICE" | "CREDIT_NOTE");
  const problems = [...missing.map((m) => `instelling: ${m}`)];
  if (!d.buyerName.trim()) problems.push("naam van de afnemer");
  if (!d.buyerAddress?.trim()) problems.push("adres van de afnemer");
  if (d.lines.length === 0) problems.push("minstens één regel");
  if (d.lines.some((l) => l.vatRateBp == null)) problems.push("een btw-tarief bij elke regel");
  if (totalsOf(d.lines).grossCents <= 0) problems.push("een totaalbedrag groter dan nul");
  if (!d.deliveryText?.trim() && d.kind === "INVOICE") problems.push("de leveringsdatum of -periode");
  if (problems.length > 0) throw new ApiError(409, `Nog niet definitief te maken. Ontbreekt: ${problems.join(", ")}.`);
  if (d.kind === "CREDIT_NOTE") {
    const orig = await prisma.commercialInvoice.findUnique({ where: { id: d.creditedInvoiceId! }, include: { lines: true } });
    const credited = await creditedGross(d.creditedInvoiceId!, true);
    if (!orig || credited + totalsOf(d.lines).grossCents > totalsOf(orig.lines).grossCents) throw new ApiError(409, "Samen zouden de creditnota's meer bedragen dan de oorspronkelijke factuur.");
  }

  const kindField = d.kind === "INVOICE" ? ("nextInvoiceNumber" as const) : ("nextCreditNumber" as const);
  for (let attempt = 0; attempt < 5; attempt++) {
    const s = await prisma.commercialInvoiceSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID } });
    const n = s[kindField]!;
    const number = formatDocumentNumber(d.kind === "INVOICE" ? s.invoicePrefix : s.creditPrefix, n);
    const day = today();
    const done = await prisma
      .$transaction(async (tx) => {
        // Het volgnummer wordt in dezelfde transactie opgehoogd; wie tegelijk bezig is, krijgt een ander nummer of probeert opnieuw.
        const claim = await tx.commercialInvoiceSettings.updateMany({ where: { id: SETTINGS_ID, [kindField]: n }, data: { [kindField]: n + 1 } });
        if (claim.count === 0) return false;
        const r = await tx.commercialInvoice.updateMany({
          where: { id, status: "DRAFT", version: d.version },
          data: {
            status: "ISSUED", number, issuedOn: dateOnly(day), issuedById: ctx.userId, version: { increment: 1 },
            dueOn: d.kind === "INVOICE" ? dateOnly(addDays(day, s.paymentTermDays!)) : null,
            supplierSnapshot: { legalName: s.legalName, street: s.street, postalCode: s.postalCode, city: s.city, kvkNumber: s.kvkNumber, vatNumber: s.vatNumber, iban: d.kind === "INVOICE" ? s.iban : null, paymentTermDays: s.paymentTermDays },
          },
        });
        if (r.count === 0) throw new ApiError(409, "Het document is intussen gewijzigd of al definitief gemaakt. Laad de pagina opnieuw.");
        return true;
      })
      .catch((e) => {
        if ((e as { code?: string }).code === "P2002") return false; // nummer bestaat al: opnieuw proberen
        throw e;
      });
    if (done) {
      await auditRecord(ctx, { action: d.kind === "INVOICE" ? "invoice.issue" : "credit_note.issue", entity: "invoice", entityId: id, after: { number } });
      return { number };
    }
  }
  throw new ApiError(409, "Het nummer kon niet worden toegekend omdat er tegelijk andere documenten werden uitgegeven. Probeer het opnieuw.");
}

async function getInvoiceSettingsForIssuing() {
  const row = await prisma.commercialInvoiceSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) return { ...SETTINGS_DEFAULTS, version: 0, saved: false } as Settings;
  return { ...row, saved: true } as Settings;
}

// ---------- Betalingen ----------

export async function addPayment(ctx: RecordCtx, invoiceId: string, input: { amountCents: number; paidOn: string; note?: string | null }) {
  need(ctx, "payments:create");
  const d = await loadDoc(ctx, invoiceId, "read");
  if (d.kind !== "INVOICE" || d.status !== "ISSUED") throw new ApiError(409, "Betalingen kunnen alleen bij een definitieve factuur.");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new ApiError(400, "Het bedrag moet groter zijn dan nul.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) || Number.isNaN(Date.parse(input.paidOn))) throw new ApiError(400, "Geef een geldige betaaldatum.");
  const credited = await creditedGross(invoiceId);
  const paid = d.payments.filter((p) => !p.voidedAt).reduce((a, p) => a + p.amountCents, 0);
  const outstanding = totalsOf(d.lines).grossCents - credited - paid;
  if (input.amountCents > outstanding) throw new ApiError(400, "Dit bedrag is hoger dan wat nog openstaat.");
  const p = await prisma.commercialPayment.create({ data: { invoiceId, amountCents: input.amountCents, paidOn: dateOnly(input.paidOn), note: trim(input.note), createdById: ctx.userId } });
  await auditRecord(ctx, { action: "payment.create", entity: "payment", entityId: p.id, after: { invoiceId } });
  return p.id;
}

/** Een foute betaling wordt ongeldig gemaakt en blijft zichtbaar; er wordt niets verwijderd. */
export async function voidPayment(ctx: RecordCtx, paymentId: string) {
  need(ctx, "payments:update");
  const p = await prisma.commercialPayment.findUnique({ where: { id: paymentId } });
  if (!p) throw new ApiError(404, "Betaling niet gevonden.");
  await loadDoc(ctx, p.invoiceId, "read");
  const r = await prisma.commercialPayment.updateMany({ where: { id: paymentId, voidedAt: null }, data: { voidedAt: new Date(), voidedById: ctx.userId } });
  if (r.count === 0) throw new ApiError(409, "Deze betaling is al ongeldig gemaakt.");
  await auditRecord(ctx, { action: "payment.void", entity: "payment", entityId: paymentId, after: { invoiceId: p.invoiceId } });
}

/** Gegevens voor de pdf; alleen van definitieve documenten, met bevoegdheid om te downloaden. */
export async function documentForPdf(ctx: RecordCtx, id: string) {
  const d = await loadDoc(ctx, id, "download");
  if (d.status !== "ISSUED" || !d.number) throw new ApiError(409, "Alleen een definitief document kan als pdf worden gedownload.");
  const orig = d.creditedInvoiceId ? await prisma.commercialInvoice.findUnique({ where: { id: d.creditedInvoiceId }, select: { number: true } }) : null;
  await auditRecord(ctx, { action: "invoice.download", entity: "invoice", entityId: id });
  return { doc: d, creditedNumber: orig?.number ?? null };
}

// ---- Versturen per e-mail ----

export type InvoiceSender = (mail: { to: string; subject: string; bodyText: string; filename: string; pdf: Buffer; replyTo?: string }) => Promise<{ providerMessageId: string | null }>;

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Voorstel voor onderwerp en tekst van de mail; de gebruiker kan beide aanpassen vóór het versturen. */
export async function getSendDefaults(ctx: RecordCtx, id: string) {
  const d = await loadDoc(ctx, id, "send");
  if (d.status !== "ISSUED" || !d.number) throw new ApiError(409, "Alleen een definitief document kan worden verstuurd.");
  const supplier = (d.supplierSnapshot ?? {}) as Record<string, string | null>;
  const name = supplier.legalName ?? "HHC Hardenberg";
  const credit = d.kind === "CREDIT_NOTE";
  const subject = `${credit ? "Creditnota" : "Factuur"} ${d.number} van ${name}`;
  const lines = credit
    ? [`Beste ${d.buyerName},`, `Hierbij ontvangt u creditnota ${d.number}. De creditnota vindt u als pdf in de bijlage.`]
    : [`Beste ${d.buyerName},`, `Hierbij ontvangt u factuur ${d.number}${d.dueOn ? `, te betalen vóór ${new Intl.DateTimeFormat("nl-NL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(d.dueOn)}` : ""}. De factuur vindt u als pdf in de bijlage.`];
  const bodyText = `${lines.join("\n\n")}\n\nMet vriendelijke groet,\n${name}`;
  const contacts = ctx.can("contacts:read")
    ? (await prisma.commercialContact.findMany({ where: { companyId: d.companyId, archivedAt: null, email: { not: null } }, select: { name: true, email: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] })).map((c) => ({ name: c.name, email: c.email! }))
    : [];
  const deliveries = (await prisma.commercialInvoiceDelivery.findMany({ where: { invoiceId: id }, orderBy: { createdAt: "desc" }, take: 20 })).map((x) => ({
    id: x.id, toEmail: x.toEmail, status: x.status, error: x.error, createdAt: x.createdAt,
  }));
  return { subject, bodyText, contacts, deliveries };
}

export async function sendDocument(ctx: RecordCtx, id: string, input: { to: string; subject: string; bodyText: string }, sender: InvoiceSender) {
  const d = await loadDoc(ctx, id, "send");
  if (d.status !== "ISSUED" || !d.number) throw new ApiError(409, "Alleen een definitief document kan worden verstuurd.");
  const to = input.to.trim();
  const subject = input.subject.trim();
  const bodyText = input.bodyText.trim();
  if (!EMAIL_RE.test(to) || to.length > 200) throw new ApiError(400, "Vul één geldig e-mailadres in.");
  if (!subject || subject.length > 200) throw new ApiError(400, "Geef een onderwerp (maximaal 200 tekens).");
  if (!bodyText || bodyText.length > 5000) throw new ApiError(400, "Geef een berichttekst (maximaal 5000 tekens).");
  const orig = d.creditedInvoiceId ? await prisma.commercialInvoice.findUnique({ where: { id: d.creditedInvoiceId }, select: { number: true } }) : null;
  const { renderDocumentPdf } = await import("./invoice-render");
  const pdf = await renderDocumentPdf(d, orig?.number ?? null);
  try {
    const r = await sender({ to, subject, bodyText, filename: `${d.number.replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`, pdf });
    await prisma.commercialInvoiceDelivery.create({ data: { invoiceId: id, toEmail: to, subject, status: "SENT", providerMessageId: r.providerMessageId, sentById: ctx.userId } });
    await auditRecord(ctx, { action: "invoice.send", entity: "invoice", entityId: id });
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 300) : "Onbekende fout";
    await prisma.commercialInvoiceDelivery.create({ data: { invoiceId: id, toEmail: to, subject, status: "FAILED", error: message, sentById: ctx.userId } });
    throw new ApiError(502, "Het versturen is niet gelukt. Er is niets verstuurd; probeer het later opnieuw of download de pdf.");
  }
}
