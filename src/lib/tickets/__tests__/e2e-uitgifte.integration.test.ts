// End-to-end levenscyclus van HHC-tickets tegen een echte Postgres (TEST_DATABASE_URL, anders overgeslagen):
// inrichting, uitgeven (enkel, bulk, CSV/Excel), drempel met vier ogen, beheeracties, seizoenspassen,
// gastenlijsten, actiecodes, afgelasten/verplaatsen, CZ-brug en randgevallen (tijd, gelijktijdigheid, aantallen).
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { TicketsActor } from "../authz.server";
import type { ScanActor } from "../scanner-auth.server";
import { ALL_TICKET_PERMISSIONS, type TicketPermission } from "../permissions";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;
// Nooit echte mail: zonder sleutel faalt elke verzending en komt hij als FAILED in het verzendlog.
delete process.env.RESEND_API_KEY;

type Db = typeof import("@/lib/prisma");
let db: Db["prisma"];
let svc: typeof import("../tickets.server");
let batches: typeof import("../batches.server");
let catalog: typeof import("../catalog.server");
let scan: typeof import("../scan.server");
let token: typeof import("../token");
let bulk: typeof import("../bulk");
let xlsx: typeof import("../xlsx-read");

function actor(id: string, perms: readonly TicketPermission[] = ALL_TICKET_PERMISSIONS): TicketsActor {
  const set = new Set(perms);
  return { id, name: `Test ${id}`, access: { userId: id, isSuperadmin: false, hasAccess: true, permissions: [...perms], can: (p) => set.has(p) } };
}
const admin = actor("e2e-admin-a");
const admin2 = actor("e2e-admin-b");
const admin3 = actor("e2e-admin-c");
const supervisor: ScanActor = { kind: "scanner", name: "Supervisor", scannerId: null, userId: null, entranceId: null, canOverride: true, canSeeStats: false };

const DAY = 86_400_000;
let seasonId: string, nextSeasonId: string, zoneId: string, typeSingle: string, typeMulti: string, typeSeason: string, typeRange: string;
let ev1: string, ev2: string;
let n = 0;
const cid = () => `e2e-client-${Date.now()}-${n++}`;
const holder = (i: number) => ({ firstName: `Voor${i}`, lastName: `Achter${i}`, email: `h${i}@test.nl` });

async function wipe() {
  await db.ticketPromoClaim.deleteMany();
  await db.ticketPromo.deleteMany();
  await db.ticketScan.deleteMany();
  await db.ticketDelivery.deleteMany();
  await db.ticketEventLink.deleteMany();
  await db.ticket.deleteMany();
  await db.ticketBatch.deleteMany();
  await db.ticketType.deleteMany();
  await db.ticketEvent.deleteMany();
  await db.ticketZone.deleteMany();
  await db.ticketSeason.deleteMany();
  await db.ticketAuditEvent.deleteMany();
  await db.ticketGuestList.deleteMany();
  await db.ticketPublicHit.deleteMany();
  await db.ticketSettings.deleteMany();
}

async function issueOne(typeId: string, eventIds: string[], extra: Record<string, unknown> = {}) {
  const r = (await svc.issueTickets(admin, { typeId, eventIds, holders: [holder(n++)], ...extra })) as { ticketIds: string[] };
  return db.ticket.findUniqueOrThrow({ where: { id: r.ticketIds[0] } });
}

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../tickets.server");
  batches = await import("../batches.server");
  catalog = await import("../catalog.server");
  scan = await import("../scan.server");
  token = await import("../token");
  bulk = await import("../bulk");
  xlsx = await import("../xlsx-read");
  await wipe();
  seasonId = (await catalog.saveSeason(admin, null, { name: "E2E 2026-2099", startsOn: "2026-07-01", endsOn: "2099-06-30" }))!.id;
  nextSeasonId = (await catalog.saveSeason(admin, null, { name: "E2E 2099-2100", startsOn: "2099-07-01", endsOn: "2100-06-30" }))!.id;
  zoneId = (await catalog.saveZone(admin, null, { name: "E2E Hoofdtribune" }))!.id;
  const soon = Date.now() + 3 * DAY;
  ev1 = (await catalog.saveEvent(admin, null, { title: "E2E – Thuis 1", startsAt: new Date(soon).toISOString(), status: "ACTIVE", seasonId }))!.id;
  ev2 = (await catalog.saveEvent(admin, null, { title: "E2E – Thuis 2", startsAt: new Date(soon + 7 * DAY).toISOString(), status: "ACTIVE", seasonId }))!.id;
  typeSingle = (await catalog.saveType(admin, null, { name: "E2E Vrijkaart", category: "FREE", validityMode: "SINGLE", zoneId }))!.id;
  typeMulti = (await catalog.saveType(admin, null, { name: "E2E Meerdere", category: "VIP", validityMode: "MULTI" }))!.id;
  typeSeason = (await catalog.saveType(admin, null, { name: "E2E Seizoenskaart", category: "SEASON", validityMode: "SEASON", seasonId }))!.id;
  typeRange = (await catalog.saveType(admin, null, { name: "E2E Periode", category: "STAFF", validityMode: "RANGE" }))!.id;
});

after(async () => {
  if (skip) return;
  await wipe();
  await db.$disconnect();
});

// ── Inrichting ─────────────────────────────────────────────────────────────

test("inrichting: unieke namen, datumcontroles, standaardeinde en seizoen op datum", { skip }, async () => {
  await assert.rejects(() => catalog.saveSeason(admin, null, { name: "E2E 2026-2099", startsOn: "2030-01-01", endsOn: "2030-06-01" }), /al een seizoen/);
  await assert.rejects(() => catalog.saveSeason(admin, null, { name: "Omgekeerd", startsOn: "2030-06-01", endsOn: "2030-01-01" }));
  await assert.rejects(() => catalog.saveZone(admin, null, { name: "E2E Hoofdtribune" }), /al een vak/);
  await assert.rejects(() => catalog.saveType(admin, null, { name: "E2E Vrijkaart", category: "FREE", validityMode: "SINGLE" }), /al een tickettype/);
  await assert.rejects(() => catalog.saveType(admin, null, { name: "Fout", category: "FREE", validityMode: "RANGE", validFrom: "2030-02-01", validUntil: "2030-01-01" }), /einddatum/);
  await assert.rejects(() => catalog.saveEvent(admin, null, { title: "Fout", startsAt: "2030-01-01T19:00:00Z", endsAt: "2030-01-01T18:00:00Z" }));
  await assert.rejects(() => catalog.saveEvent(admin, null, { title: "Fout", startsAt: "geen datum" }));
  const ev = (await catalog.saveEvent(admin, null, { title: "E2E – Standaardeinde", startsAt: "2030-03-01T19:30:00Z" }))!;
  assert.equal(ev.endsAt.getTime() - ev.startsAt.getTime(), 6 * 3600_000, "standaard aftrap + 6 uur");
  assert.equal(ev.seasonId, seasonId, "seizoen afgeleid uit de datum");
  // Een seizoensdocument wijzigen houdt hetzelfde id.
  const again = await catalog.saveSeason(admin, nextSeasonId, { name: "E2E 2099-2100", startsOn: "2099-07-01", endsOn: "2100-06-30" });
  assert.equal(again!.id, nextSeasonId);
  assert.ok(await db.ticketAuditEvent.count({ where: { action: "season.saved" } }) >= 3);
});

test("wedstrijd verwijderen kan alleen zonder tickets/scans/mails; archiveren met geldige tickets pas na afloop", { skip }, async () => {
  const empty = (await catalog.saveEvent(admin, null, { title: "E2E – Leeg", startsAt: new Date(Date.now() + 20 * DAY).toISOString() }))!.id;
  await assert.rejects(() => catalog.removeEvent(admin, empty, { mode: "delete", confirmTitle: "verkeerd" }), /Typ de titel/);
  assert.deepEqual(await catalog.removeEvent(admin, empty, { mode: "delete", confirmTitle: "  e2e – leeg " }), { deleted: true });

  // Alleen een verzonden mail (geen ticket meer actief) blokkeert verwijderen ook.
  const mailed = (await catalog.saveEvent(admin, null, { title: "E2E – Mail", startsAt: new Date(Date.now() + 21 * DAY).toISOString() }))!.id;
  const t = await issueOne(typeSingle, [mailed]);
  await db.ticketDelivery.create({ data: { ticketId: t.id, channel: "EMAIL", status: "SENT", kind: "EVENT_CANCELLED", eventId: mailed } });
  const u = await catalog.eventUsage(mailed);
  assert.equal(u.canDelete, false);
  assert.match(u.reason!, /1 tickets.*1 verzonden mails/);
  await assert.rejects(() => catalog.removeEvent(admin, mailed, { mode: "archive", confirmTitle: "E2E – Mail" }), /geldige tickets/);
  await svc.changeStatus(admin, t.id, { status: "CANCELLED", reason: "test archiveren" });
  assert.deepEqual(await catalog.removeEvent(admin, mailed, { mode: "archive", confirmTitle: "E2E – Mail", reason: "weg" }), { archived: true });
  // Gearchiveerd: niet te wijzigen en niet meer uit te geven.
  await assert.rejects(() => catalog.saveEvent(admin, mailed, { title: "x", startsAt: new Date().toISOString() }), /gearchiveerd/);
  await assert.rejects(() => svc.issueTickets(admin, { typeId: typeSingle, eventIds: [mailed], holders: [holder(1)] }), /gearchiveerd/);
  await catalog.restoreEvent(admin, mailed);
  assert.equal((await db.ticketEvent.findUniqueOrThrow({ where: { id: mailed } })).archivedAt, null);
});

test("seizoensdatums corrigeren: uitgegeven seizoenskaarten lopen mee", { skip }, async () => {
  const sid = (await catalog.saveSeason(admin, null, { name: "E2E Correctie", startsOn: "2104-07-01", endsOn: "2105-05-31" }))!.id;
  const typeId = (await catalog.saveType(admin, null, { name: "E2E Correctiekaart", category: "SEASON", validityMode: "SEASON", seasonId: sid }))!.id;
  const card = await issueOne(typeId, []);
  assert.equal(card.validUntil?.toISOString(), "2105-05-31T21:59:59.999Z");
  await catalog.saveSeason(admin, sid, { name: "E2E Correctie", startsOn: "2104-07-01", endsOn: "2105-06-30" });
  const after = await db.ticket.findUniqueOrThrow({ where: { id: card.id } });
  assert.equal(after.validUntil?.toISOString(), "2105-06-30T21:59:59.999Z", "kaart verloopt niet op de oude einddatum");
  assert.equal(after.validFrom?.toISOString(), "2104-06-30T22:00:00.000Z", "begint om 00:00 Nederlandse tijd");
});

// ── Uitgeven per geldigheid ─────────────────────────────────────────────────

test("uitgeven per soort: één, meerdere, seizoen en periode met de juiste vervaldatum", { skip }, async () => {
  await assert.rejects(() => svc.issueTickets(admin, { typeId: typeSingle, eventIds: [ev1, ev2], holders: [holder(1)] }), /precies één/);
  await assert.rejects(() => svc.issueTickets(admin, { typeId: typeMulti, eventIds: [], holders: [holder(1)] }), /minstens één/);
  await assert.rejects(() => svc.issueTickets(admin, { typeId: typeSingle, eventIds: ["bestaat-niet"], holders: [holder(1)] }), /bestaat niet/);
  await assert.rejects(() => svc.issueTickets(admin, { typeId: "bestaat-niet", eventIds: [ev1], holders: [holder(1)] }), /tickettype bestaat niet/);

  const single = await issueOne(typeSingle, [ev1]);
  const e1 = await db.ticketEvent.findUniqueOrThrow({ where: { id: ev1 } });
  const e2 = await db.ticketEvent.findUniqueOrThrow({ where: { id: ev2 } });
  assert.equal(single.validUntil?.getTime(), e1.endsAt.getTime(), "vervalt na de wedstrijd");
  assert.equal(single.zoneId, zoneId, "standaardvak van het type");

  const multi = await issueOne(typeMulti, [ev1, ev2, ev1]);
  assert.equal(multi.validUntil?.getTime(), e2.endsAt.getTime(), "vervalt na de laatste wedstrijd");
  assert.equal(await db.ticketEventLink.count({ where: { ticketId: multi.id } }), 2, "dubbele wedstrijd telt één keer");

  const season = await issueOne(typeSeason, []);
  assert.equal(season.isSeasonCard, true);
  assert.equal(season.validUntil?.toISOString(), "2099-06-30T21:59:59.999Z");

  await assert.rejects(() => svc.issueTickets(admin, { typeId: typeRange, holders: [holder(1)] }), /tot wanneer/);
  await assert.rejects(() => svc.issueTickets(admin, { typeId: typeRange, validFrom: "2030-02-01", validUntil: "2030-01-01", holders: [holder(1)] }), /einddatum/);
  await assert.rejects(() => svc.issueTickets(admin, { typeId: typeRange, validUntil: "2020-01-01", holders: [holder(1)] }), /verleden/);
  const range = await issueOne(typeRange, [], { validFrom: "2030-01-01", validUntil: "2030-01-31" });
  assert.equal(range.validUntil?.toISOString(), "2030-01-31T22:59:59.999Z", "wintertijd: 23:59 in Nederland");
  assert.equal(range.validFrom?.toISOString(), "2029-12-31T23:00:00.000Z", "wintertijd: 00:00 in Nederland");

  // Niet-actief type of vak.
  const inactiveZone = (await catalog.saveZone(admin, null, { name: "E2E Gesloten vak", active: false }))!.id;
  await assert.rejects(() => svc.issueTickets(admin, { typeId: typeSingle, zoneId: inactiveZone, eventIds: [ev1], holders: [holder(1)] }), /niet actief/);
  const off = (await catalog.saveType(admin, null, { name: "E2E Uit", category: "FREE", validityMode: "SINGLE", active: false }))!.id;
  await assert.rejects(() => svc.issueTickets(admin, { typeId: off, eventIds: [ev1], holders: [holder(1)] }), /niet meer actief/);
});

test("wedstrijd in het verleden: geen uitgifte; lopende wedstrijd (aftrap voorbij, einde niet) wel", { skip }, async () => {
  const past = (await catalog.saveEvent(admin, null, { title: "E2E – Gisteren", startsAt: new Date(Date.now() - DAY).toISOString() }))!.id;
  await assert.rejects(() => svc.issueTickets(admin, { typeId: typeSingle, eventIds: [past], holders: [holder(1)] }), /al voorbij/);
  const live = (await catalog.saveEvent(admin, null, { title: "E2E – Bezig", startsAt: new Date(Date.now() - 3600_000).toISOString() }))!.id;
  const t = await issueOne(typeSingle, [live]);
  assert.equal(t.status, "ACTIVE");
  // Een verlopen ticket toont als Verlopen en kan niet opnieuw geactiveerd worden.
  await db.ticket.update({ where: { id: t.id }, data: { validUntil: new Date(Date.now() - 1000) } });
  assert.equal((await svc.getTicket(admin, t.id)).status, "EXPIRED");
  await svc.changeStatus(admin, t.id, { status: "BLOCKED", reason: "test verlopen" });
  await assert.rejects(() => svc.changeStatus(admin, t.id, { status: "ACTIVE", reason: "terug" }), /verlopen/);
});

test("wedstrijd via het formulier verzetten: de vervaldatum van gekoppelde tickets loopt mee", { skip }, async () => {
  const start = new Date(Date.now() + 10 * DAY);
  const ev = (await catalog.saveEvent(admin, null, { title: "E2E – Verzet via formulier", startsAt: start.toISOString(), seasonId }))!;
  const t = await issueOne(typeSingle, [ev.id]);
  const m = await issueOne(typeMulti, [ev.id, ev1]);
  const later = new Date(start.getTime() + 14 * DAY);
  const saved = (await catalog.saveEvent(admin, ev.id, { title: ev.title, startsAt: later.toISOString(), endsAt: new Date(later.getTime() + 4 * 3600_000).toISOString(), seasonId, status: "ACTIVE" }))!;
  assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).validUntil?.getTime(), saved.endsAt.getTime());
  assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: m.id } })).validUntil?.getTime(), saved.endsAt.getTime());
  // En het ticket is op de nieuwe datum scanbaar (niet verlopen).
  await db.ticketEvent.update({ where: { id: ev.id }, data: { startsAt: new Date(Date.now() - 600_000), endsAt: new Date(Date.now() + 3600_000) } });
  await db.ticket.update({ where: { id: t.id }, data: { validUntil: new Date(Date.now() + 3600_000) } });
  const res = await scan.processScan(supervisor, { eventId: ev.id, code: token.qrCodeFor(t.publicId, t.qrVersion), clientId: cid() });
  assert.equal(res.result, "VALID");
});

// ── Drempel en vier ogen ───────────────────────────────────────────────────

test("drempel (standaard 50): 50 direct, 51 als aanvraag; zelf goedkeuren faalt, een ander keurt één keer goed", { skip }, async () => {
  const settings = await (await import("../settings.server")).getTicketSettings();
  assert.equal(settings.bulkApprovalThreshold, 50);
  const fifty = await svc.issueTickets(admin, { typeId: typeSingle, eventIds: [ev1], holders: Array.from({ length: 50 }, (_, i) => holder(1000 + i)) });
  assert.equal(fifty.pendingApproval, false);
  assert.equal(fifty.count, 50);

  const req = (await svc.issueTickets(admin, { typeId: typeSingle, eventIds: [ev1], holders: Array.from({ length: 51 }, (_, i) => holder(2000 + i)), batchName: "E2E 51" }, "CSV")) as { pendingApproval: true; batchId: string };
  assert.equal(req.pendingApproval, true);
  assert.equal(await db.ticket.count({ where: { batchId: req.batchId } }), 0, "nog niets uitgegeven");
  await assert.rejects(() => batches.reviewBatch(admin, req.batchId, { decision: "approve" }), /eigen bulkuitgifte/);
  await assert.rejects(() => batches.reviewBatch(actor("geen-recht", ["tickets:issue"]), req.batchId, { decision: "approve" }), /bevoegdheid/);

  // Twee collega's keuren tegelijk goed: precies één uitgifte.
  const both = await Promise.allSettled([batches.reviewBatch(admin2, req.batchId, { decision: "approve" }), batches.reviewBatch(admin3, req.batchId, { decision: "approve" })]);
  assert.equal(both.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await db.ticket.count({ where: { batchId: req.batchId } }), 51);
  const b = await db.ticketBatch.findUniqueOrThrow({ where: { id: req.batchId } });
  assert.equal(b.status, "ISSUED");
  assert.equal(b.payload, null, "persoonsgegevens uit de aanvraag gewist");
  const t = await db.ticket.findFirstOrThrow({ where: { batchId: req.batchId } });
  assert.equal(t.issuedById, admin.id, "op naam van de aanvrager");
  assert.equal(await db.ticketAuditEvent.count({ where: { batchId: req.batchId, action: "batch.approved" } }), 1);

  // Afwijzen wist de payload ook.
  const rej = (await svc.issueTickets(admin2, { typeId: typeSingle, eventIds: [ev1], holders: Array.from({ length: 51 }, (_, i) => holder(3000 + i)) })) as { batchId: string };
  await batches.reviewBatch(admin, rej.batchId, { decision: "reject", note: "niet nodig" });
  const rb = await db.ticketBatch.findUniqueOrThrow({ where: { id: rej.batchId } });
  assert.equal(rb.status, "REJECTED");
  assert.equal(rb.payload, null);
  await assert.rejects(() => batches.reviewBatch(admin3, rej.batchId, { decision: "approve" }), /al beoordeeld/);
});

test("goedkeuren controleert opnieuw: inmiddels afgelaste wedstrijd geeft niets uit", { skip }, async () => {
  const ev = (await catalog.saveEvent(admin, null, { title: "E2E – Later afgelast", startsAt: new Date(Date.now() + 9 * DAY).toISOString() }))!.id;
  const req = (await svc.issueTickets(admin, { typeId: typeSingle, eventIds: [ev], holders: Array.from({ length: 51 }, (_, i) => holder(4000 + i)) })) as { batchId: string };
  await db.ticketEvent.update({ where: { id: ev }, data: { status: "CANCELLED" } });
  await assert.rejects(() => batches.reviewBatch(admin2, req.batchId, { decision: "approve" }), /afgelaste/);
  assert.equal((await db.ticketBatch.findUniqueOrThrow({ where: { id: req.batchId } })).status, "PENDING_APPROVAL");
});

test("grote aantallen: 500 in één batch binnen redelijke tijd en met een auditregel per ticket", { skip }, async () => {
  const settings = await import("../settings.server");
  await settings.saveTicketSettings(admin, { bulkApprovalThreshold: 1000, retentionPersonalMonths: 24, retentionScanMonths: 24, retentionTechnicalDays: 90 });
  const t0 = Date.now();
  const r = (await svc.issueTickets(admin, { typeId: typeMulti, eventIds: [ev1, ev2], holders: Array.from({ length: 500 }, (_, i) => holder(10_000 + i)) })) as { ticketIds: string[] };
  const ms = Date.now() - t0;
  assert.equal(r.ticketIds.length, 500);
  assert.equal(await db.ticketEventLink.count({ where: { ticketId: { in: r.ticketIds } } }), 1000);
  assert.equal(await db.ticketAuditEvent.count({ where: { ticketId: { in: r.ticketIds }, action: "ticket.created" } }), 500);
  assert.ok(ms < 15_000, `500 tickets duurde ${ms} ms`);
  await settings.saveTicketSettings(admin, { bulkApprovalThreshold: 50, retentionPersonalMonths: 24, retentionScanMonths: 24, retentionTechnicalDays: 90 });
});

// ── CSV en Excel ─────────────────────────────────────────────────────────

test("CSV: BOM, puntkomma, aanhalingstekens, lege regels, foute rijen, dubbelen en rare tekens", { skip }, async () => {
  const csv =
    "﻿Voornaam;Achternaam;E-mailadres;Telefoon;Bedrijf;Onbekend\r\n" +
    'Zoë;"Ünal; de Wit";ZOE@Test.NL;0612345678;"Bakkerij ""De Korst""";x\r\n' +
    ";;;;;\r\n" +
    "Jan;;jan@test.nl;;;\r\n" +
    "Piet;Puk;geen-mail;;;\r\n" +
    "Zoë;Ünal; de Wit;zoe@test.nl;;;\r\n" +
    "Zoë;\"Ünal; de Wit\";zoe@test.nl;;;\r\n" +
    "José 😀;O'Neill-Ğ;;;;\r\n";
  const r = bulk.parseBulkCsv(csv);
  assert.deepEqual(r.unknownColumns, ["Onbekend"]);
  assert.equal(r.holders[0].lastName, "Ünal; de Wit");
  assert.equal(r.holders[0].email, "zoe@test.nl");
  assert.equal(r.holders[0].company, 'Bakkerij "De Korst"');
  assert.deepEqual(r.errors.map((e) => e.row), [4, 5, 6], "regelnummers zoals in het bestand (ook na een lege regel)");
  assert.equal(r.duplicates, 1);
  assert.ok(r.holders.some((h) => h.firstName === "José 😀" && h.lastName === "O'Neill-Ğ"));
  // Alles wat de controle doorlaat, moet ook echt uit te geven zijn.
  const res = await svc.issueTickets(admin, { typeId: typeSingle, eventIds: [ev1], holders: r.holders }, "CSV");
  assert.equal(res.count, r.holders.length);
});

test("CSV: wat de controle goedkeurt, faalt niet alsnog bij uitgeven (te lange velden, rand-e-mailadressen)", { skip }, async () => {
  const long = "x".repeat(140);
  const csv = ["Voornaam,Achternaam,E-mailadres,Telefoon,Bedrijf,Relatie", `Ok,Persoon,ok@test.nl,,,`, `Lang,Telefoon,,${"0".repeat(40)},,`, `Lang,Bedrijf,,,${long},`, `Lang,Relatie,,,,${long}`, `Rare,Mail,a..b@test.nl,,,`].join("\n");
  const r = bulk.parseBulkCsv(csv);
  // Ofwel de rij wordt als fout gemeld, ofwel hij is uit te geven: nooit een heel bestand dat bij "Uitgeven" onderuit gaat.
  const res = await svc.issueTickets(admin, { typeId: typeSingle, eventIds: [ev1], holders: r.holders }, "CSV").catch((e: Error) => e);
  assert.ok(!(res instanceof Error), `uitgeven faalde na een geslaagde controle: ${res instanceof Error ? res.message.slice(0, 200) : ""}`);
  assert.equal(r.holders.length + r.errors.length, 5);
});

test("CSV in Windows-1252 (Excel NL 'CSV met scheidingsteken') wordt goed gelezen", { skip }, async () => {
  // "Voornaam;Achternaam\nRené;Müller" in cp1252: é = 0xE9, ü = 0xFC.
  const bytes = Uint8Array.from([...Buffer.from("Voornaam;Achternaam\r\nRen", "latin1"), 0xe9, ...Buffer.from(";M", "latin1"), 0xfc, ...Buffer.from("ller\r\n", "latin1")]);
  const r = bulk.parseBulkCsv(bulk.decodeBulkText(bytes));
  assert.equal(r.holders[0].firstName, "René");
  assert.equal(r.holders[0].lastName, "Müller");
  // Gewone UTF-8 blijft UTF-8.
  assert.equal(bulk.parseBulkCsv(bulk.decodeBulkText(new TextEncoder().encode("Voornaam;Achternaam\nZoë;Ünal"))).holders[0].firstName, "Zoë");
});

async function makeXlsx(sheetXml: string, shared: string[]) {
  const zip = new JSZip();
  zip.file("xl/workbook.xml", '<workbook xmlns:r="r"><sheets><sheet name="Blad1" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file("xl/sharedStrings.xml", `<sst>${shared.map((s) => `<si>${s}</si>`).join("")}</sst>`);
  zip.file("xl/worksheets/sheet1.xml", `<worksheet><sheetData>${sheetXml}</sheetData></worksheet>`);
  return zip.generateAsync({ type: "uint8array" });
}

test("Excel: gedeelde en inline tekst, entiteiten, rich text, lege cellen en getallen", { skip }, async () => {
  const shared = ["<t>Voornaam</t>", "<t>Achternaam</t>", "<t>E-mail</t>", "<t>Anne &amp; Co</t>", '<r><t>de </t></r><r><t xml:space="preserve">Vries</t></r>', "<t>&#233;&#x00E9;</t>"];
  const sheet =
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="inlineStr"><is><t>Telefoon</t></is></c></row>' +
    '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="D2"><v>612345678</v></c></row>' +
    '<row r="3"/>' +
    '<row r="4"><c r="A4" t="inlineStr"><is><t>&lt;b&gt;</t></is></c><c r="B4" t="s"><v>5</v></c><c r="C4" t="inlineStr"><is><t>x@test.nl</t></is></c></row>';
  const rows = await xlsx.readFirstSheet(await makeXlsx(sheet, shared));
  const r = bulk.parseBulkRows(rows);
  assert.equal(r.errors.length, 0);
  assert.equal(r.holders.length, 2);
  assert.equal(r.holders[0].firstName, "Anne & Co");
  assert.equal(r.holders[0].lastName, "de Vries");
  assert.equal(r.holders[1].firstName, "<b>");
  assert.equal(r.holders[1].lastName, "éé", "ook hexadecimale tekenverwijzingen");
  await assert.rejects(() => xlsx.readFirstSheet(new TextEncoder().encode("geen zip")), /geen geldig Excel/);
});

// ── Beheeracties ─────────────────────────────────────────────────────────

test("beheer: blokkeren/annuleren/heractiveren met reden, opnieuw uitgeven en link intrekken maken de oude ongeldig", { skip }, async () => {
  const t = await issueOne(typeSingle, [ev1]);
  await assert.rejects(() => svc.changeStatus(admin, t.id, { status: "BLOCKED", reason: "" }));
  await assert.rejects(() => svc.changeStatus(admin, t.id, { status: "ACTIVE", reason: "al actief" }), /niet mogelijk/);
  await svc.changeStatus(admin, t.id, { status: "BLOCKED", reason: "verdacht" });
  await svc.changeStatus(admin, t.id, { status: "ACTIVE", reason: "opgehelderd" });
  await svc.changeStatus(admin, t.id, { status: "CANCELLED", reason: "niet meer nodig" });
  await assert.rejects(() => svc.changeStatus(admin, t.id, { status: "BLOCKED", reason: "x y z" }), /niet mogelijk/);
  await svc.changeStatus(admin, t.id, { status: "ACTIVE", reason: "toch wel" });
  const actions = (await db.ticketAuditEvent.findMany({ where: { ticketId: t.id }, orderBy: { at: "asc" } })).map((a) => [a.action, a.reason]);
  assert.deepEqual(actions.slice(1), [["ticket.blocked", "verdacht"], ["ticket.reactivated", "opgehelderd"], ["ticket.cancelled", "niet meer nodig"], ["ticket.reactivated", "toch wel"]]);

  // Gelijktijdig blokkeren en annuleren: één wint, de ander krijgt een conflict.
  const both = await Promise.allSettled([svc.changeStatus(admin, t.id, { status: "BLOCKED", reason: "tegelijk 1" }), svc.changeStatus(admin2, t.id, { status: "CANCELLED", reason: "tegelijk 2" })]);
  assert.equal(both.filter((r) => r.status === "fulfilled").length, 1);
  await svc.changeStatus(admin, t.id, { status: "ACTIVE", reason: "terug actief" });

  const oldQr = token.qrCodeFor(t.publicId, t.qrVersion);
  await assert.rejects(() => svc.reissue(admin, t.id, { what: "qr", reason: "" }));
  const r = await svc.reissue(admin, t.id, { what: "qr", reason: "telefoon kwijt" });
  assert.equal(r.qrVersion, t.qrVersion + 1);
  const evRow = await db.ticketEvent.findUniqueOrThrow({ where: { id: ev1 } });
  await db.ticketEvent.update({ where: { id: ev1 }, data: { startsAt: new Date(Date.now() - 600_000) } });
  try {
    assert.equal((await scan.processScan(supervisor, { eventId: ev1, code: oldQr, clientId: cid() })).reason, "OUTDATED");
    assert.equal((await scan.processScan(supervisor, { eventId: ev1, code: token.qrCodeFor(t.publicId, r.qrVersion), clientId: cid() })).result, "VALID");
  } finally {
    await db.ticketEvent.update({ where: { id: ev1 }, data: { startsAt: evRow.startsAt } });
  }

  const { ticketByToken } = await import("../design/public.server");
  const oldLink = token.linkTokenFor(t.publicId, t.linkVersion);
  assert.ok(await ticketByToken(oldLink));
  await svc.reissue(admin, t.id, { what: "link", reason: "link gedeeld" });
  assert.equal(await ticketByToken(oldLink), null, "oude link werkt niet meer");
  assert.ok(await ticketByToken(token.linkTokenFor(t.publicId, t.linkVersion + 1)));
  assert.equal(await db.ticketAuditEvent.count({ where: { ticketId: t.id, action: { in: ["ticket.reissued", "ticket.link_revoked"] }, reason: { not: null } } }), 2);
});

test("anonimiseren: gegevens weg, ticket dicht, link en QR ongeldig, niets meer mogelijk; reden verplicht", { skip }, async () => {
  const t = await issueOne(typeSingle, [ev1], { holders: [{ firstName: "Geheim", lastName: "Persoon", email: "geheim@test.nl", phone: "0611111111", company: "Bedrijf", note: "allergie" }] });
  await assert.rejects(() => svc.anonymize(admin, t.id, " "), /reden/);
  await assert.rejects(() => svc.anonymize(actor("x", ["tickets:read"]), t.id, "AVG-verzoek"), /bevoegdheid/);
  await svc.anonymize(admin, t.id, "AVG-verzoek");
  const a = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
  assert.equal(a.status, "CANCELLED");
  assert.equal(a.email, null);
  assert.equal(a.note, null);
  assert.ok(!JSON.stringify(a).includes("Geheim"));
  assert.ok(!JSON.stringify(await db.ticketAuditEvent.findMany({ where: { ticketId: t.id } })).includes("Geheim"), "geen naam in het auditlog");
  await assert.rejects(() => svc.changeStatus(admin, t.id, { status: "ACTIVE", reason: "terug" }), /geanonimiseerd/);
  await assert.rejects(() => svc.reissue(admin, t.id, { what: "qr", reason: "nieuw" }), /geanonimiseerd/);
  const sp = await import("../seasonpass.server");
  await assert.rejects(() => sp.transferTicket(admin, t.id, { holder: holder(1), reason: "overdragen" }), /geanonimiseerd/);
  assert.deepEqual(await svc.anonymize(admin, t.id, "nog een keer"), { ok: true }, "idempotent");
});

// ── Seizoenspassen ────────────────────────────────────────────────────────

test("seizoenspas overdragen: nieuwe houder zonder notitie van de vorige, oude QR ongeldig", { skip }, async () => {
  const sp = await import("../seasonpass.server");
  const card = await issueOne(typeSeason, [], { holders: [{ firstName: "Oud", lastName: "Houder", email: "oud@test.nl", note: "rolstoelplek, tel. oud" }] });
  await assert.rejects(() => sp.transferTicket(admin, card.id, { holder: holder(1), reason: "" }));
  await sp.transferTicket(admin, card.id, { holder: { firstName: "Nieuw", lastName: "Houder", email: "nieuw@test.nl" }, reason: "verkocht aan buurman" });
  const t = await db.ticket.findUniqueOrThrow({ where: { id: card.id } });
  assert.equal(t.firstName, "Nieuw");
  assert.equal(t.qrVersion, card.qrVersion + 1);
  assert.equal(t.note, null, "de notitie over de vorige houder gaat niet mee naar de nieuwe");
});

test("seizoenspassen verlengen terwijl een eerdere verlenging op goedkeuring wacht: geen dubbele passen", { skip }, async () => {
  const sp = await import("../seasonpass.server");
  const from = (await catalog.saveSeason(admin, null, { name: "E2E Verleng A", startsOn: "2026-08-01", endsOn: "2098-06-30" }))!.id;
  const to = (await catalog.saveSeason(admin, null, { name: "E2E Verleng B", startsOn: "2098-07-01", endsOn: "2099-06-30" }))!.id;
  await svc.issueTickets(admin, { typeId: typeSeason, seasonId: from, holders: Array.from({ length: 51 }, (_, i) => holder(20_000 + i)) }).then(async (r) => {
    if (r.pendingApproval) await batches.reviewBatch(admin2, (r as { batchId: string }).batchId, { decision: "approve" });
  });
  const r1 = await sp.renewSeasonPasses(admin, { fromSeasonId: from, toSeasonId: to });
  assert.equal(r1.pendingApproval, 51);
  const r2 = await sp.renewSeasonPasses(admin, { fromSeasonId: from, toSeasonId: to });
  // Tweede keer: de 51 houders wachten al op goedkeuring, dus er hoort geen tweede aanvraag bij te komen.
  const pending = await db.ticketBatch.count({ where: { status: "PENDING_APPROVAL", name: { startsWith: "Verlenging E2E Verleng A" } } });
  assert.equal(pending, 1, `er staan ${pending} verlengingsaanvragen open (tweede run: ${JSON.stringify(r2)})`);
});

// ── Gastenlijsten ────────────────────────────────────────────────────────

test("gastenlijst: te lang bedrijf of rare regel wordt bij inlezen gemeld, niet pas bij uitgeven", { skip }, async () => {
  const gl = await import("../guestlist.server");
  const { id } = await gl.saveGuestList(admin, null, { name: "E2E Sponsors", kind: "SPONSOR" });
  const added = await gl.addMembers(admin, id, { text: `Jan Smit; jan@test.nl; ${"B".repeat(150)}; 2\nAlleenvoornaam\nPiet Puk; ; ; 99\nKees de Boer\tkees@test.nl\tBoer BV\t1` });
  assert.deepEqual(added.errors.map((e) => e.line), [1, 2, 3]);
  assert.match(added.errors[0].message, /bedrijfsnaam/);
  assert.equal(added.added, 1);
  const res = await gl.issueFromList(admin, id, { issue: { typeId: typeSingle, eventIds: [ev2] } }).catch((e: Error) => e);
  assert.ok(!(res instanceof Error), `uitgeven voor de lijst faalde: ${res instanceof Error ? res.message.slice(0, 160) : ""}`);
});

// ── Actiecodes ───────────────────────────────────────────────────────────

test("actiecode: gelijktijdig inwisselen houdt het maximum, verlopen/nog niet begonnen/uitgezet, code ongevoelig voor spaties", { skip }, async () => {
  const pr = await import("../promo.server");
  const { id, code } = await pr.savePromo(admin, { name: "E2E Race", typeId: typeSingle, eventIds: [ev2], maxClaims: 3, maxPerEmail: 1, ticketsPerClaim: 1 });
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => pr.claimPromo({ code, firstName: "Race", lastName: `Deelnemer${i}`, email: `race${i}@test.nl` }, `10.0.0.${i}`)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
  assert.equal(await db.ticketPromoClaim.count({ where: { promoId: id } }), 3);
  // Zelfde e-mail tegelijk: maar één.
  const { code: c2 } = await pr.savePromo(admin, { name: "E2E Zelfde mail", code: "e2e mail 01", typeId: typeSingle, eventIds: [ev2], maxClaims: 10 });
  assert.equal(c2, "E2EMAIL01");
  const same = await Promise.allSettled([0, 1, 2].map((i) => pr.claimPromo({ code: " e2e-mail01 ".replace("-", ""), firstName: "Dub", lastName: "Bel", email: "dubbel@test.nl" }, `10.1.0.${i}`)));
  assert.equal(same.filter((r) => r.status === "fulfilled").length, 1);

  const later = await pr.savePromo(admin, { name: "E2E Later", typeId: typeSingle, eventIds: [ev2], maxClaims: 5, claimFrom: new Date(Date.now() + DAY).toISOString() });
  await assert.rejects(() => pr.claimPromo({ code: later.code, firstName: "A", lastName: "B", email: "later@test.nl" }, "10.2.0.1"), /nog niet begonnen/);
  const over = await pr.savePromo(admin, { name: "E2E Voorbij", typeId: typeSingle, eventIds: [ev2], maxClaims: 5, claimUntil: new Date(Date.now() - 1000).toISOString() });
  await assert.rejects(() => pr.claimPromo({ code: over.code, firstName: "A", lastName: "B", email: "voorbij@test.nl" }, "10.2.0.2"), /afgelopen/);
  await pr.setPromoActive(admin, over.id, false);
  assert.equal((await pr.publicPromoInfo(over.code)).message, "Deze actie is niet (meer) actief.");
  await assert.rejects(() => pr.publicPromoInfo("BESTAAT-NIET"), /bestaat niet/);
  // Een code voor een wedstrijd die inmiddels voorbij is, geeft een nette melding en geen ticket.
  const evOld = (await catalog.saveEvent(admin, null, { title: "E2E – Actie straks voorbij", startsAt: new Date(Date.now() + DAY).toISOString() }))!.id;
  const gone = await pr.savePromo(admin, { name: "E2E Wedstrijd voorbij", typeId: typeSingle, eventIds: [evOld], maxClaims: 5 });
  await db.ticketEvent.update({ where: { id: evOld }, data: { startsAt: new Date(Date.now() - 2 * DAY), endsAt: new Date(Date.now() - DAY) } });
  await assert.rejects(() => pr.claimPromo({ code: gone.code, firstName: "A", lastName: "B", email: "oud@test.nl" }, "10.2.0.3"), /voorbij/);
  assert.equal(await db.ticketPromoClaim.count({ where: { promoId: gone.id } }), 0);
});

// ── Afgelasten en verplaatsen ─────────────────────────────────────────────

test("afgelasten met mail: zonder maildienst niets verstuurd, wel als mislukt gelogd en opnieuw te proberen", { skip }, async () => {
  const ec = await import("../eventchange.server");
  const ev = (await catalog.saveEvent(admin, null, { title: "E2E – Afgelast met mail", startsAt: new Date(Date.now() + 4 * DAY).toISOString(), seasonId }))!.id;
  const a = await issueOne(typeSingle, [ev]);
  await issueOne(typeSingle, [ev], { holders: [{ firstName: "Twee", lastName: "Tickets", email: a.email }] });
  await issueOne(typeSingle, [ev], { holders: [{ firstName: "Geen", lastName: "Mail" }] });
  const r = await ec.changeEvent(admin, ev, { action: "CANCEL", message: "Veld onbespeelbaar", sendMail: true });
  assert.equal(r.dryRun, false);
  assert.ok(r.recipients >= 1);
  if (!r.dryRun) {
    assert.equal(r.sent, 0, "er gaat geen echte mail de deur uit");
    assert.equal(r.failed, r.recipients);
  }
  assert.equal(await db.ticketDelivery.count({ where: { eventId: ev, kind: "EVENT_CANCELLED", status: "FAILED" } }), r.recipients);
  assert.equal(await db.ticketAuditEvent.count({ where: { eventId: ev, action: "event.cancelled" } }), 1);
  // Mail versturen vereist het recht tickets:resend.
  const ev3 = (await catalog.saveEvent(admin, null, { title: "E2E – Geen recht", startsAt: new Date(Date.now() + 4 * DAY).toISOString() }))!.id;
  await assert.rejects(() => ec.changeEvent(actor("ev", ["events:manage"]), ev3, { action: "CANCEL", sendMail: true }), /bevoegdheid/);
});

test("verplaatsen zonder nieuw einde houdt de duur van de wedstrijd aan", { skip }, async () => {
  const ec = await import("../eventchange.server");
  const start = new Date(Date.now() + 6 * DAY);
  const ev = (await catalog.saveEvent(admin, null, { title: "E2E – Duur", startsAt: start.toISOString(), seasonId }))!;
  const t = await issueOne(typeSingle, [ev.id]);
  const newStart = new Date(start.getTime() + 7 * DAY);
  await ec.changeEvent(admin, ev.id, { action: "MOVE", startsAt: newStart.toISOString(), sendMail: false });
  const moved = await db.ticketEvent.findUniqueOrThrow({ where: { id: ev.id } });
  assert.equal(moved.endsAt.getTime() - moved.startsAt.getTime(), ev.endsAt.getTime() - ev.startsAt.getTime());
  assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).validUntil?.getTime(), moved.endsAt.getTime());
});

// ── CZ-brug ──────────────────────────────────────────────────────────────

test("CZ-brug: dezelfde referentie twee keer in één aanvraag maakt één ticket en laat de rest niet stil vallen", { skip }, async () => {
  const { issueFromCommercial } = await import("../commercial-bridge.server");
  const req = (ref: string, i: number) => ({ originSystem: "commercial", externalRef: ref, commercialCompanyId: "cz-1", typeId: typeSingle, eventIds: [ev2], holder: holder(30_000 + i) });
  const r = await issueFromCommercial(admin, [req("e2e:a", 1), req("e2e:b", 2), req("e2e:a", 3)]);
  const issued = await db.ticket.findMany({ where: { originSystem: "commercial", externalRef: { in: ["e2e:a", "e2e:b"] } } });
  assert.equal(issued.length, 2, `uitgegeven: ${issued.length}, antwoorden: ${JSON.stringify(r.map((x) => x.status))}`);
  assert.equal(r[1].status, "ISSUED");
  assert.ok(r[1].ticketId);
  // Opnieuw: alles is al uitgegeven, met ticketnummer.
  const again = await issueFromCommercial(admin, [req("e2e:a", 1), req("e2e:b", 2)]);
  assert.deepEqual(again.map((x) => x.status), ["ALREADY_ISSUED", "ALREADY_ISSUED"]);
  assert.ok(again.every((x) => x.ticketId));
});

// ── Tijdzones ────────────────────────────────────────────────────────────

test("tijdzone: een aftrap om 00:30 op 1 juli (Amsterdam) hoort bij het seizoen dat op 1 juli begint", { skip }, async () => {
  await catalog.saveSeason(admin, null, { name: "E2E TZ 2101-2102", startsOn: "2101-07-01", endsOn: "2102-06-30" });
  const b = (await catalog.saveSeason(admin, null, { name: "E2E TZ 2102-2103", startsOn: "2102-07-01", endsOn: "2103-06-30" }))!.id;
  // 1 juli 2102 00:30 zomertijd = 30 juni 22:30 UTC.
  const ev = (await catalog.saveEvent(admin, null, { title: "E2E – Middernacht", startsAt: "2102-06-30T22:30:00.000Z" }))!;
  assert.equal(ev.seasonId, b);
});

test("tijdzone: datum-tijdinvoer in Nederlandse tijd rond de omschakeling naar zomer- en wintertijd", { skip }, async () => {
  const { fromLocalInput, toLocalInput } = await import("@/components/tickets/parts");
  const cases: [string, string][] = [
    ["2027-01-15T20:00", "2027-01-15T19:00:00.000Z"],
    ["2027-07-01T00:30", "2027-06-30T22:30:00.000Z"],
    ["2026-12-31T23:30", "2026-12-31T22:30:00.000Z"],
    ["2027-03-28T01:30", "2027-03-28T00:30:00.000Z"], // laatste uur wintertijd
    ["2027-03-28T03:30", "2027-03-28T01:30:00.000Z"], // eerste uur zomertijd
    ["2026-10-25T01:30", "2026-10-24T23:30:00.000Z"], // nog zomertijd
    ["2026-10-25T03:30", "2026-10-25T02:30:00.000Z"], // wintertijd
  ];
  for (const [local, iso] of cases) {
    assert.equal(fromLocalInput(local), iso, local);
    assert.equal(toLocalInput(iso), local);
  }
});

test("tijdzone: periode- en seizoenskaarten lopen van 00:00 tot 23:59 Nederlandse tijd", { skip }, async () => {
  const t = await issueOne(typeRange, [], { validFrom: "2030-03-30", validUntil: "2030-03-31" });
  // 31 maart 2030 is de overgang naar zomertijd: einde dag = 21:59:59 UTC; 30 maart is nog wintertijd: begin = 29 maart 23:00 UTC.
  assert.equal(t.validUntil?.toISOString(), "2030-03-31T21:59:59.999Z");
  assert.equal(t.validFrom?.toISOString(), "2030-03-29T23:00:00.000Z");
});
