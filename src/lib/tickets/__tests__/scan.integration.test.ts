// Integratietest van het scannen tegen een echte Postgres (TEST_DATABASE_URL, anders overgeslagen).
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { TicketsActor } from "../authz.server";
import type { ScanActor } from "../scanner-auth.server";
import { ALL_TICKET_PERMISSIONS } from "../permissions";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

type Db = typeof import("@/lib/prisma");
let db: Db["prisma"];
let svc: typeof import("../tickets.server");
let catalog: typeof import("../catalog.server");
let scan: typeof import("../scan.server");
let token: typeof import("../token");

const set = new Set(ALL_TICKET_PERMISSIONS);
const admin: TicketsActor = { id: "admin-a", name: "Admin", access: { userId: "admin-a", isSuperadmin: false, hasAccess: true, permissions: [...ALL_TICKET_PERMISSIONS], can: (p) => set.has(p) } };
const scanner = (over: Partial<ScanActor> = {}): ScanActor => ({ kind: "scanner", name: "Scanner 1", scannerId: null, userId: null, entranceId: null, canOverride: false, canSeeStats: false, ...over });
const supervisor = scanner({ name: "Supervisor", canOverride: true });

let eventId: string, fhEventId: string, noFhEventId: string, typeSingle: string, typeSeason: string, seasonId: string, zoneA: string, zoneB: string;
let n = 0;
const cid = () => `test-client-${Date.now()}-${n++}`;

async function wipe() {
  await db.ticketScan.deleteMany();
  await db.ticketScanner.deleteMany();
  await db.ticketEntrance.deleteMany();
  await db.ticketExternalTicket.deleteMany();
  await db.ticketEventLink.deleteMany();
  await db.ticket.deleteMany();
  await db.ticketType.deleteMany();
  await db.ticketEvent.deleteMany();
  await db.ticketZone.deleteMany();
  await db.ticketSeason.deleteMany();
  await db.ticketAuditEvent.deleteMany();
  await db.ticketGuestList.deleteMany();
}

async function issue(typeId: string, eventIds: string[], extra: Record<string, unknown> = {}) {
  const r = (await svc.issueTickets(admin, { typeId, eventIds, holders: [{ firstName: "Anna", lastName: "de Vries", email: "a@test.nl" }], ...extra })) as { ticketIds: string[] };
  const t = await db.ticket.findUniqueOrThrow({ where: { id: r.ticketIds[0] } });
  return { id: t.id, code: token.qrCodeFor(t.publicId, t.qrVersion) };
}
const doScan = (a: ScanActor, eventId_: string, code: string, extra: Record<string, unknown> = {}) => scan.processScan(a, { eventId: eventId_, code, clientId: cid(), ...extra });

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../tickets.server");
  catalog = await import("../catalog.server");
  scan = await import("../scan.server");
  token = await import("../token");
  await wipe();
  const soon = new Date(Date.now() + 3600_000).toISOString();
  seasonId = (await catalog.saveSeason(admin, null, { name: "Test 2099", startsOn: new Date().toISOString().slice(0, 10), endsOn: "2099-06-30" }))!.id;
  eventId = (await catalog.saveEvent(admin, null, { title: "HHC – Test", startsAt: soon, status: "ACTIVE", seasonId, allowReentry: true }))!.id;
  fhEventId = (await catalog.saveEvent(admin, null, { title: "Fullhouse-test", startsAt: soon, status: "ACTIVE" }))!.id;
  await db.ticketEvent.update({ where: { id: fhEventId }, data: { externalId: "mock-event-1", source: "FULLHOUSE" } });
  noFhEventId = (await catalog.saveEvent(admin, null, { title: "Zonder koppeling", startsAt: soon, status: "ACTIVE" }))!.id;
  zoneA = (await catalog.saveZone(admin, null, { name: "Tribune A" }))!.id;
  zoneB = (await catalog.saveZone(admin, null, { name: "Tribune B" }))!.id;
  typeSingle = (await catalog.saveType(admin, null, { name: "Vrijkaart", category: "FREE", validityMode: "SINGLE", zoneId: zoneA }))!.id;
  typeSeason = (await catalog.saveType(admin, null, { name: "Seizoenskaart", category: "SEASON", validityMode: "SEASON", seasonId }))!.id;
});

after(async () => {
  if (skip) return;
  await wipe();
  await db.$disconnect();
});

test("eerste scan geldig, tweede waarschuwing met vorige tijd, override alleen door supervisor", { skip }, async () => {
  const t = await issue(typeSingle, [eventId]);
  const first = await doScan(scanner(), eventId, t.code);
  assert.equal(first.result, "VALID");
  assert.match(first.label ?? "", /Vrijkaart/);
  const second = await doScan(scanner(), eventId, t.code);
  assert.equal(second.result, "WARNING");
  assert.equal(second.reason, "ALREADY_USED");
  assert.ok(second.previous);
  assert.equal(second.overridable, false);
  await assert.rejects(doScan(scanner(), eventId, t.code, { override: { reason: "Reden genoeg" } }), /supervisor/i);
  const over = await doScan(supervisor, eventId, t.code, { override: { reason: "Kaart gescand bij ruzie" } });
  assert.equal(over.result, "VALID");
  assert.equal(over.overridden, true);
  const audit = await db.ticketAuditEvent.findMany({ where: { action: "scan.override", ticketId: t.id } });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].reason, "Kaart gescand bij ruzie");
});

test("twee scanners tegelijk: precies één geldige scan", { skip }, async () => {
  const t = await issue(typeSingle, [eventId]);
  const rs = await Promise.all([doScan(scanner(), eventId, t.code), doScan(scanner(), eventId, t.code), doScan(scanner(), eventId, t.code)]);
  assert.equal(rs.filter((r) => r.result === "VALID").length, 1);
  assert.equal(rs.filter((r) => r.result === "WARNING").length, 2);
});

test("dezelfde clientId geeft dezelfde uitslag en telt niet dubbel", { skip }, async () => {
  const t = await issue(typeSingle, [eventId]);
  const id = cid();
  const a = await scan.processScan(scanner(), { eventId, code: t.code, clientId: id });
  const b = await scan.processScan(scanner(), { eventId, code: t.code, clientId: id });
  assert.equal(a.scanId, b.scanId);
  assert.equal(await db.ticketScan.count({ where: { ticketId: t.id } }), 1);
});

test("geannuleerd, vervalst en verkeerde wedstrijd worden geweigerd", { skip }, async () => {
  const t = await issue(typeSingle, [eventId]);
  await svc.changeStatus(admin, t.id, { status: "CANCELLED", reason: "Test annulering" });
  const c = await doScan(scanner(), eventId, t.code);
  assert.deepEqual([c.result, c.reason], ["INVALID", "CANCELLED"]);
  const forged = await doScan(scanner(), eventId, `${t.code.slice(0, -3)}AAA`);
  assert.deepEqual([forged.result, forged.reason], ["INVALID", "NOT_FOUND"]);
  const other = await issue(typeSingle, [eventId]);
  const w = await doScan(scanner(), noFhEventId, other.code);
  assert.deepEqual([w.result, w.reason], ["INVALID", "WRONG_EVENT"]);
  assert.equal((await doScan(supervisor, eventId, t.code, { override: { reason: "Poging tot override" } })).result, "INVALID", "een geannuleerd ticket is niet te overrulen");
});

test("seizoenskaart mag opnieuw naar binnen als de wedstrijd dat toestaat", { skip }, async () => {
  const t = await issue(typeSeason, []);
  assert.equal((await doScan(scanner(), eventId, t.code)).result, "VALID");
  const again = await doScan(scanner(), eventId, t.code);
  assert.equal(again.result, "VALID");
  assert.equal(again.reentry, true);
});

test("ticket voor een ander vak dan de ingang wordt geweigerd", { skip }, async () => {
  const entr = await db.ticketEntrance.create({ data: { name: "Ingang B", zoneId: zoneB } });
  const t = await issue(typeSingle, [eventId]);
  const r = await doScan(scanner(), eventId, t.code, { entranceId: entr.id });
  assert.deepEqual([r.result, r.reason], ["INVALID", "WRONG_ZONE"]);
  assert.equal((await doScan(scanner(), eventId, t.code)).result, "VALID", "zonder ingang geen vakcontrole");
});

test("Fullhouse-codes: geldig, dubbel, ongeldig, onbekend en wedstrijd zonder koppeling", { skip }, async () => {
  const a = await doScan(scanner(), fhEventId, "FH-TEST-0001");
  assert.equal(a.result, "VALID");
  assert.equal(a.source, "FULLHOUSE");
  assert.equal((await doScan(scanner(), fhEventId, "FH-TEST-0001")).result, "WARNING");
  assert.deepEqual((await doScan(scanner(), fhEventId, "FH-TEST-INVALID")).reason, "CANCELLED");
  assert.deepEqual((await doScan(scanner(), fhEventId, "ONBEKEND-123")).reason, "NOT_FOUND");
  assert.deepEqual((await doScan(scanner(), noFhEventId, "FH-TEST-0002")).reason, "WRONG_EVENT");
  const cached = await db.ticketExternalTicket.findMany({ where: { eventExtId: "mock-event-1" } });
  assert.ok(cached.length >= 1);
  assert.ok(cached.every((c) => c.codeHash.length === 64), "alleen een hash van de barcode wordt bewaard");
  assert.ok(!JSON.stringify(cached).includes("FH-TEST-0001"));
});

test("offline-lijst en terugmelden: scans komen één keer binnen en de server beoordeelt opnieuw", { skip }, async () => {
  const t = await issue(typeSingle, [eventId]);
  const cache = await scan.offlineCache(eventId);
  const pid = t.code.split(".")[1];
  assert.ok(cache.hhc.some((h) => h.p === pid));
  assert.ok(!JSON.stringify(cache).includes("Vries"), "geen achternamen in de offline-lijst");
  const a = { eventId, code: t.code, clientId: cid(), scannedAt: new Date(Date.now() - 60_000).toISOString() };
  const b = { eventId, code: t.code, clientId: cid(), scannedAt: new Date(Date.now() - 30_000).toISOString() };
  const r1 = await scan.syncScans(scanner(), { scans: [b, a] });
  assert.deepEqual(r1.results.map((r) => r.result), ["VALID", "WARNING"], "op volgorde van scannen beoordeeld");
  const r2 = await scan.syncScans(scanner(), { scans: [a, b] });
  assert.equal(r2.results.length, 2);
  assert.equal(await db.ticketScan.count({ where: { ticketId: t.id } }), 2, "opnieuw terugmelden voegt niets toe");
  assert.ok((await db.ticketScan.findMany({ where: { ticketId: t.id } })).every((s) => s.offline));
});

test("aantallen en historie", { skip }, async () => {
  const stats = await scan.scanStats(eventId);
  assert.ok(stats.valid > 0 && stats.warnings > 0);
  assert.ok(stats.inside <= stats.valid);
  const h = await scan.scanHistory({ eventId, result: "WARNING" });
  assert.ok(h.rows.every((r) => r.result === "WARNING"));
});

test("concept- en afgesloten wedstrijden zijn te kiezen en te scannen, afgelaste niet", { skip }, async () => {
  const soon = new Date(Date.now() + 3600_000).toISOString();
  const draft = (await catalog.saveEvent(admin, null, { title: "Concept-duel", startsAt: soon, status: "DRAFT" }))!.id;
  const cancelled = (await catalog.saveEvent(admin, null, { title: "Afgelast duel", startsAt: soon, status: "ACTIVE" }))!.id;
  const t2 = await issue(typeSingle, [cancelled]);
  await db.ticketEvent.update({ where: { id: cancelled }, data: { status: "CANCELLED" } });
  const ctx = await scan.scanContext(scanner());
  const ids = ctx.events.map((e) => e.id);
  assert.ok(ids.includes(draft), "een conceptwedstrijd staat in de keuzelijst");
  assert.ok(!ids.includes(cancelled), "een afgelaste wedstrijd staat er niet in");
  const t = await issue(typeSingle, [draft]);
  assert.equal((await doScan(scanner(), draft, t.code)).result, "VALID");
  assert.deepEqual(((r) => [r.result, r.reason])(await doScan(scanner(), cancelled, t2.code)), ["INVALID", "EVENT_NOT_ACTIVE"]);
});

test("meerdere wedstrijden tegelijk: de server kiest de wedstrijd waar het ticket bij hoort", { skip }, async () => {
  const soon = new Date(Date.now() + 3600_000).toISOString();
  const second = (await catalog.saveEvent(admin, null, { title: "Tweede duel", startsAt: soon, status: "ACTIVE" }))!.id;
  const t = await issue(typeSingle, [second]);
  const r = await doScan(scanner(), eventId, t.code, { eventIds: [eventId, second] });
  assert.equal(r.result, "VALID");
  assert.equal(r.eventId, second);
  const fh = await doScan(scanner(), noFhEventId, "FH-TEST-0003", { eventIds: [noFhEventId, fhEventId] });
  assert.equal(fh.result, "VALID");
  assert.equal(fh.eventId, fhEventId);
  const none = await doScan(scanner(), fhEventId, "ONBEKEND-456", { eventIds: [fhEventId, second] });
  assert.equal(none.reason, "NOT_FOUND");
});

test("seizoenspassen met een voorbije datum blijven kiesbaar, gewone oude duels niet", { skip }, async () => {
  const old = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const pass = (await catalog.saveEvent(admin, null, { title: "Seizoenspas 2025/26", startsAt: old, status: "ACTIVE" }))!.id;
  const oldMatch = (await catalog.saveEvent(admin, null, { title: "Oud duel", startsAt: old, status: "ACTIVE" }))!.id;
  const ids = (await scan.scanContext(scanner())).events.map((e) => e.id);
  assert.ok(ids.includes(pass));
  assert.ok(!ids.includes(oldMatch));
});

test("handmatig inchecken: loopt door de scanlogica en wordt als override vastgelegd", { skip }, async () => {
  const md = await import("../matchday.server");
  const t = await issue(typeSingle, [eventId]);
  const first = await md.manualCheckIn(admin, { eventId, ticketId: t.id, reason: "telefoon leeg" });
  assert.equal(first.result, "VALID");
  const row = await db.ticketScan.findFirstOrThrow({ where: { ticketId: t.id }, orderBy: { scannedAt: "desc" } });
  assert.match(row.note ?? "", /Handmatig ingecheckt: telefoon leeg/);
  const over = await md.matchdayOverview(eventId);
  assert.ok(over.inside >= 1);
  await assert.rejects(() => md.manualCheckIn(admin, { eventId, ticketId: t.id, reason: "x" }));
  const noPerm: TicketsActor = { ...admin, access: { ...admin.access, can: () => false } };
  await assert.rejects(() => md.manualCheckIn(noPerm, { eventId, ticketId: t.id, reason: "geen recht" }));
});

test("seizoenspassen: overzicht, verlengen (idempotent) en overdragen maakt de oude QR ongeldig", { skip }, async () => {
  const sp = await import("../seasonpass.server");
  const past = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const pastEv = (await catalog.saveEvent(admin, null, { title: "Thuis verleden", startsAt: past, status: "ACTIVE", seasonId, isHome: true }))!.id;
  const card = await issue(typeSeason, []);
  const before = await sp.seasonPassOverview(admin, { seasonId });
  const row = before.rows.find((r) => r.id === card.id)!;
  assert.ok(row.eligible >= 1);
  assert.equal(row.attended, 0);
  assert.equal(row.streak, row.eligible);
  await db.ticketScan.create({ data: { clientId: cid(), scannedAt: new Date(), eventId: pastEv, source: "HHC", ticketId: card.id, result: "VALID" } });
  const after = (await sp.seasonPassOverview(admin, { seasonId })).rows.find((r) => r.id === card.id)!;
  assert.equal(after.attended, 1);
  const detail = await sp.seasonPassDetail(admin, card.id);
  assert.equal(detail.games.find((g) => g.id === pastEv)?.attended, true);

  const next = (await catalog.saveSeason(admin, null, { name: "Test 2100", startsOn: "2099-07-01", endsOn: "2100-06-30" }))!.id;
  const r1 = await sp.renewSeasonPasses(admin, { fromSeasonId: seasonId, toSeasonId: next });
  assert.ok(r1.created >= 1);
  const r2 = await sp.renewSeasonPasses(admin, { fromSeasonId: seasonId, toSeasonId: next });
  assert.equal(r2.created, 0);
  assert.ok(r2.skipped >= 1);

  await sp.transferTicket(admin, card.id, { holder: { firstName: "Bram", lastName: "Jansen", email: "b@test.nl" }, reason: "pas overgenomen" });
  const res = await doScan(supervisor, eventId, card.code);
  assert.equal(res.result, "INVALID");
  assert.equal(res.reason, "NOT_FOUND");
  assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: card.id } })).firstName, "Bram");
  const audit = await db.ticketAuditEvent.findFirst({ where: { ticketId: card.id, action: "ticket.transferred" } });
  assert.ok(audit && !JSON.stringify(audit).includes("Jansen"), "geen namen in het auditlog");
});

test("gastenlijst: uitgeven per wedstrijd, extra tickets op 'Gast van', geen dubbele uitgifte", { skip }, async () => {
  const gl = await import("../guestlist.server");
  const { id } = await gl.saveGuestList(admin, null, { name: "Businessclub", kind: "SPONSOR" });
  const added = await gl.addMembers(admin, id, { text: "Jan Smit; jan@bakkerij.nl; Bakkerij Smit; 3\nAnna Bos" });
  assert.equal(added.added, 2);
  const body = { issue: { typeId: typeSingle, zoneId: null, eventIds: [eventId], seasonId: null, validFrom: null, validUntil: null } };
  const r1 = await gl.issueFromList(admin, id, body);
  assert.equal(r1.count, 4);
  assert.equal(r1.skipped, 0);
  const guests = await db.ticket.count({ where: { firstName: "Gast van", relation: "Businessclub" } });
  assert.equal(guests, 2);
  const r2 = await gl.issueFromList(admin, id, body);
  assert.equal(r2.count, 0);
  assert.equal(r2.skipped, 2);
});

test("afgelasten en verplaatsen: tickets blijven geldig, geldigheid loopt mee, geen dubbele mail bij proefrun", { skip }, async () => {
  const ec = await import("../eventchange.server");
  const start = new Date(Date.now() + 5 * 86_400_000);
  const ev = (await catalog.saveEvent(admin, null, { title: "Te verplaatsen", startsAt: start.toISOString(), status: "ACTIVE", seasonId }))!.id;
  const t = await issue(typeSingle, [ev]);
  const dry = await ec.changeEvent(admin, ev, { action: "MOVE", startsAt: new Date(start.getTime() + 14 * 86_400_000).toISOString(), sendMail: true, dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.ok(dry.recipients >= 1);
  const newStart = new Date(start.getTime() + 14 * 86_400_000);
  await ec.changeEvent(admin, ev, { action: "MOVE", startsAt: newStart.toISOString(), sendMail: false });
  const moved = await db.ticketEvent.findUniqueOrThrow({ where: { id: ev } });
  assert.equal(moved.startsAt.getTime(), newStart.getTime());
  const tk = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
  assert.equal(tk.validUntil?.getTime(), moved.endsAt.getTime());
  // Afgelast: scannen niet mogelijk, het ticket zelf blijft actief.
  await ec.changeEvent(admin, ev, { action: "CANCEL", sendMail: false });
  assert.equal((await db.ticketEvent.findUniqueOrThrow({ where: { id: ev } })).status, "CANCELLED");
  assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).status, "ACTIVE");
  const res = await doScan(supervisor, ev, t.code);
  assert.equal(res.reason, "EVENT_NOT_ACTIVE");
  await assert.rejects(() => ec.changeEvent(admin, ev, { action: "CANCEL", sendMail: false }), /al afgelast/);
  // Opnieuw plannen zet de wedstrijd weer actief.
  await ec.changeEvent(admin, ev, { action: "MOVE", startsAt: new Date(start.getTime() + 30 * 86_400_000).toISOString(), sendMail: false });
  assert.equal((await db.ticketEvent.findUniqueOrThrow({ where: { id: ev } })).status, "ACTIVE");
});
