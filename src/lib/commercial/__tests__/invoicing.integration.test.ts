// Integratietest facturatie: instellingen, definitief maken, nummering, creditnota's en betalingen. Er wordt niets verstuurd.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

let db: typeof import("@/lib/prisma").prisma;
let svc: typeof import("../service.server");
let authz: typeof import("../authz.server");
let ctxMod: typeof import("../ctx.server");
let co: typeof import("../companies.server");
let ct: typeof import("../contracts.server");
let iv: typeof import("../invoicing.server");
let pdf: typeof import("../invoice-pdf");

async function mkUser(key: string) {
  const u = await db.user.create({ data: { name: key, email: `${key}@inv.test`, passwordHash: "x", roles: ["HUB"] as never } });
  return { id: u.id, name: key, email: u.email, roles: ["HUB"] };
}
async function rejects(p: Promise<unknown>, status: number, text?: RegExp) {
  await assert.rejects(p, (e: { status?: number; message?: string }) => e.status === status && (!text || text.test(e.message ?? "")));
}

const FULL = { vatNumber: "NL123456782B01", iban: "NL91 ABNA 0417 1643 00", paymentTermDays: 30, invoicePrefix: "2026-", nextInvoiceNumber: 1, creditPrefix: "CN-", nextCreditNumber: 1 };

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../service.server");
  authz = await import("../authz.server");
  ctxMod = await import("../ctx.server");
  co = await import("../companies.server");
  ct = await import("../contracts.server");
  iv = await import("../invoicing.server");
  pdf = await import("../invoice-pdf");
  for (const t of ["commercialPayment", "commercialInvoiceDelivery", "commercialInvoiceLine", "commercialInvoice", "commercialInvoiceSettings", "commercialMailEvent", "commercialUnsubscribe", "commercialMailingRecipient", "commercialMailing", "commercialReminderLog", "commercialIndexation", "commercialOpportunity", "commercialCounterpart", "commercialContract", "commercialPackageItem", "commercialPackage", "commercialSeason", "commercialFile", "commercialTask", "commercialActivity", "commercialContact", "commercialCompany", "commercialTeam", "commercialAuditEvent", "commercialMembership", "commercialRole"] as const) {
    await (db[t] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await db.user.deleteMany({ where: { email: { endsWith: "@inv.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (!skip) await db.$disconnect();
});

test("facturatie: geblokkeerd tot gegevens compleet, nummering, onveranderlijk, credit en betalingen", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await svc.buildActor({ ...(await mkUser("adm")), roles: ["ADMIN", "HUB"] });
  const [mgr, fin, rel, own] = [await mkUser("mgr"), await mkUser("fin"), await mkUser("rel"), await mkUser("own")];
  await svc.grantMembership(admin, mgr.id, await role("beheerder"));
  await svc.grantMembership(admin, fin.id, await role("financieel-medewerker"));
  await svc.grantMembership(admin, rel.id, await role("relatiebeheerder"));
  await svc.grantMembership(admin, own.id, await role("financieel-medewerker"));
  await svc.setMemberScopes(await svc.buildActor(mgr), own.id, { companies: "OWN" });
  const cm = await ctxMod.buildRecordCtx(mgr);
  const cf = await ctxMod.buildRecordCtx(fin);
  const cr = await ctxMod.buildRecordCtx(rel);
  const cown = await ctxMod.buildRecordCtx(own);

  // Standaardgegevens van HHC zijn bekend; btw, IBAN, termijn en nummering zijn leeg.
  const s0 = await iv.getInvoiceSettings(cm);
  assert.equal(s0.legalName, "Voetbalvereniging HHC Hardenberg");
  assert.equal(s0.kvkNumber, "05026683");
  assert.equal(s0.postalCode, "7771 RH");
  assert.ok(s0.vatNumber === null && s0.iban === null && s0.paymentTermDays === null && s0.nextInvoiceNumber === null);

  const season = await ct.saveSeason(cm, null, { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30", status: "ACTIVE" });
  const pkg = await ct.savePackage(cm, null, { name: "Zilver", items: [{ title: "Bord" }] });
  const company = await co.createCompany(cm, { name: "Smit Installatie", street: "Dorpsstraat 1", postalCode: "7771 AA", city: "Hardenberg" });
  const contract = await ct.createContract(cm, company.id, { seasonId: season, packageId: pkg, startsOn: "2026-07-01", endsOn: "2027-06-30", amountCents: 250_000 });

  // Concept maken kan altijd; een contract als basis vraagt bedragenrecht en vult regel en afnemer in.
  await rejects(iv.createInvoice(cr, company.id, { contractId: contract }), 403); // relatiebeheerder mag geen facturen maken
  const id = await iv.createInvoice(cf, company.id, { contractId: contract });
  const draft = await iv.getInvoice(cf, id);
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.number, null);
  assert.equal(draft.buyerName, "Smit Installatie");
  assert.equal(draft.lines[0].unitCents, 250_000);
  assert.equal(draft.lines[0].vatRateBp, null);

  // Definitief maken is geblokkeerd: instellingen, btw-tarief en rechten.
  await rejects(iv.issueDocument(cr, id), 403);
  await rejects(iv.issueDocument(cf, id), 409, /btw-identificatienummer[\s\S]*IBAN[\s\S]*betalingstermijn[\s\S]*factuurnummering/);
  await rejects(iv.saveInvoiceSettings(cf, { ...s0, ...FULL, version: 0 }), 403); // instellingen beheren is een eigen recht
  await rejects(iv.saveInvoiceSettings(cm, { ...s0, ...FULL, iban: "NL00 0000 0000 0000 00", version: 0 }), 400);
  await rejects(iv.saveInvoiceSettings(cm, { ...s0, ...FULL, vatNumber: "123", version: 0 }), 400);
  await rejects(iv.saveInvoiceSettings(cm, { ...s0, ...FULL, creditPrefix: "2026-", version: 0 }), 400);
  await iv.saveInvoiceSettings(cm, { ...s0, ...FULL, version: 0 });
  await rejects(iv.saveInvoiceSettings(cm, { ...s0, ...FULL, version: 0 }), 409); // verouderde versie
  await rejects(iv.issueDocument(cf, id), 409, /btw-tarief/);
  await iv.updateInvoice(cf, id, { version: draft.version, lines: [{ description: "Sponsoring 2026/2027 – Zilver", unitCents: 250_000, vatRateBp: 2100 }] });
  await rejects(iv.updateInvoice(cf, id, { version: draft.version, reference: "x" }), 409); // versiecontrole

  // Twee gelijktijdige definitieve facturen krijgen verschillende, doorlopende nummers.
  const id2 = await iv.createInvoice(cf, company.id, { buyerName: "Bakkerij", buyerAddress: "Straat 2\n7771 BB Hardenberg", deliveryText: "Seizoen 2026/2027", lines: [{ description: "Banner", unitCents: 50_000, vatRateBp: 2100 }] });
  await iv.updateInvoice(cf, id, { version: (await iv.getInvoice(cf, id)).version, deliveryText: "Seizoen 2026/2027" });
  const [a, b] = await Promise.all([iv.issueDocument(cf, id), iv.issueDocument(cf, id2)]);
  assert.deepEqual([a.number, b.number].sort(), ["2026-0001", "2026-0002"]);

  // Definitief: onveranderlijk, met vaste afzendergegevens en vervaldatum.
  const issued = await iv.getInvoice(cf, id);
  assert.equal(issued.status, "ISSUED");
  assert.equal(issued.totals.grossCents, 302_500);
  assert.ok(issued.dueOn && issued.issuedOn);
  await rejects(iv.updateInvoice(cf, id, { version: issued.version, reference: "wijzig" }), 409);
  await rejects(iv.discardDraft(cf, id), 409);
  await rejects(iv.issueDocument(cf, id), 409);
  await rejects(iv.saveInvoiceSettings(cm, { ...(await iv.getInvoiceSettings(cm)), nextInvoiceNumber: 1 }), 409); // volgnummer niet terug
  await iv.saveInvoiceSettings(cm, { ...(await iv.getInvoiceSettings(cm)), legalName: "Andere naam", nextInvoiceNumber: 3 });
  const snap = await db.commercialInvoice.findUniqueOrThrow({ where: { id } });
  assert.equal((snap.supplierSnapshot as { legalName: string }).legalName, "Voetbalvereniging HHC Hardenberg");

  // Pdf op briefpapier.
  const { doc, creditedNumber } = await iv.documentForPdf(cf, id);
  assert.equal(creditedNumber, null);
  const bytes = await pdf.buildInvoicePdf({
    kind: "INVOICE", number: doc.number!, issuedOn: "2026-10-13", dueOn: "2026-11-12", deliveryText: doc.deliveryText, reference: null, creditedNumber: null,
    buyerName: doc.buyerName, buyerAddress: doc.buyerAddress, buyerVatNumber: null,
    supplier: doc.supplierSnapshot as never, lines: doc.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitCents: l.unitCents, vatRateBp: l.vatRateBp })),
  });
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  await rejects(iv.documentForPdf(cr, id), 403);

  // Versturen per e-mail: eigen recht, alleen definitief, mislukking wordt gelogd en niet als succes gemeld.
  const sent: { to: string; filename: string; head: string }[] = [];
  const ok: import("../invoicing.server").InvoiceSender = async (m) => { sent.push({ to: m.to, filename: m.filename, head: m.pdf.subarray(0, 4).toString() }); return { providerMessageId: "msg1" }; };
  const fail: import("../invoicing.server").InvoiceSender = async () => { throw new Error("Resend weigerde de e-mail"); };
  const defaults = await iv.getSendDefaults(cf, id);
  assert.ok(defaults.subject.includes(`Factuur ${issued.number}`));
  const mail = { to: "inkoop@smit.test", subject: defaults.subject, bodyText: defaults.bodyText };
  await rejects(iv.sendDocument(cr, id, mail, ok), 403);
  await rejects(iv.sendDocument(cf, id, { ...mail, to: "geen-adres" }, ok), 400);
  const draftId = await iv.createInvoice(cf, company.id, { buyerName: "X" });
  await rejects(iv.sendDocument(cf, draftId, mail, ok), 409);
  await rejects(iv.sendDocument(cown, id, mail, ok), 404); // buiten bereik
  await rejects(iv.sendDocument(cf, id, mail, fail), 502);
  await iv.sendDocument(cf, id, mail, ok);
  assert.deepEqual(sent, [{ to: "inkoop@smit.test", filename: `${issued.number}.pdf`, head: "%PDF" }]);
  assert.deepEqual((await iv.getSendDefaults(cf, id)).deliveries.map((d) => d.status).sort(), ["FAILED", "SENT"]);
  await iv.discardDraft(cf, draftId);

  // Betalingen: bedrag, openstaand, ongeldig maken.
  await rejects(iv.addPayment(cr, id, { amountCents: 100, paidOn: "2026-10-20" }), 403);
  await rejects(iv.addPayment(cf, id, { amountCents: 400_000, paidOn: "2026-10-20" }), 400);
  const pay = await iv.addPayment(cf, id, { amountCents: 100_000, paidOn: "2026-10-20" });
  assert.equal((await iv.getInvoice(cf, id)).outstandingCents, 202_500);
  await iv.voidPayment(cf, pay);
  const afterVoid = await iv.getInvoice(cf, id);
  assert.equal(afterVoid.outstandingCents, 302_500);
  assert.equal(afterVoid.payments.length, 1); // blijft zichtbaar
  await rejects(iv.voidPayment(cf, pay), 409);

  // Creditnota: concept, eigen reeks, niet meer dan de factuur, verlaagt openstaand.
  const cn = await iv.createCreditNote(cf, id, { lines: [{ description: "Banner geannuleerd", unitCents: 100_000, vatRateBp: 2100 }] });
  await rejects(iv.createCreditNote(cf, id, { lines: [{ description: "Te veel", unitCents: 300_000, vatRateBp: 2100 }] }), 400);
  const cnn = await iv.issueDocument(cf, cn);
  assert.equal(cnn.number, "CN-0001");
  const credit = await iv.getInvoice(cf, cn);
  assert.equal(credit.totals.grossCents, -121_000);
  assert.equal((await iv.getInvoice(cf, id)).outstandingCents, 302_500 - 121_000);
  await rejects(iv.createCreditNote(cf, id2, {}).then(() => iv.createCreditNote(cf, id2, {})), 400); // tweede volledige credit op dezelfde factuur kan niet

  // Bereik: 'eigen' ziet de documenten van andermans dossier niet.
  assert.equal((await iv.listInvoices(cown, {})).length, 0);
  await rejects(iv.getInvoice(cown, id), 404);
  assert.ok((await iv.listInvoices(cm, {})).length >= 3);

  // Samenvoegen houdt facturen bij het dossier.
  const dup = await co.createCompany(cm, { name: "Smit Install." });
  const idDup = await iv.createInvoice(cm, dup.id, { buyerName: "Smit Install.", lines: [] });
  await co.mergeCompanies(cm, company.id, dup.id);
  assert.equal((await db.commercialInvoice.findUniqueOrThrow({ where: { id: idDup } })).companyId, company.id);

  // Auditlog bevat nummers en aantallen, geen bedragen.
  const events = JSON.stringify(await db.commercialAuditEvent.findMany({ where: { action: { in: ["invoice.issue", "credit_note.issue", "payment.create", "payment.void", "invoice_settings.update"] } } }));
  assert.ok(events.includes("2026-0001"));
  assert.ok(!/302500|250000|100000|121000/.test(events));
});
