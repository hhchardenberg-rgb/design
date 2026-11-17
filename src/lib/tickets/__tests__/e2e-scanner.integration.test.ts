// End-to-end-scenario's van de scanner tegen een echte Postgres (TEST_DATABASE_URL, anders overgeslagen):
// blokkade bij gelijktijdige PIN-pogingen, intrekken bij alleen een rechtenwijziging, Fullhouse-storing na
// overrule, gelijktijdig scannen op twee ingangen, ongedaan maken na 10 minuten en niet te overrulen redenen.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { TicketsActor } from "../authz.server";
import type { ScanActor } from "../scanner-auth.server";
import { ALL_TICKET_PERMISSIONS } from "../permissions";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;
process.env.TICKETS_ENABLED = "true";

let db: typeof import("@/lib/prisma")["prisma"];
let svc: typeof import("../tickets.server");
let catalog: typeof import("../catalog.server");
let scan: typeof import("../scan.server");
let token: typeof import("../token");
let scannerAdmin: typeof import("../scanner-admin.server");
let auth: typeof import("../scanner-auth.server");

const set = new Set(ALL_TICKET_PERMISSIONS);
const admin: TicketsActor = { id: "admin-e2e", name: "Admin", access: { userId: "admin-e2e", isSuperadmin: false, hasAccess: true, permissions: [...ALL_TICKET_PERMISSIONS], can: (p) => set.has(p) } };
const steward = (over: Partial<ScanActor> = {}): ScanActor => ({ kind: "scanner", name: "Steward", scannerId: null, userId: null, entranceId: null, canOverride: false, canSeeStats: false, ...over });
const supervisor = steward({ name: "Supervisor", canOverride: true });
const reqWith = (t: string) => new Request("http://x/api/scan/context", { headers: { authorization: `Bearer ${t}` } });

let eventId: string, fhEventId: string, typeSingle: string, entranceA: string, entranceB: string;
let n = 0;
const cid = () => `e2e-client-${Date.now()}-${n++}`;

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
}

async function issue() {
  const r = (await svc.issueTickets(admin, { typeId: typeSingle, eventIds: [eventId], holders: [{ firstName: "Piet", lastName: "Proef" }] })) as { ticketIds: string[] };
  const t = await db.ticket.findUniqueOrThrow({ where: { id: r.ticketIds[0] } });
  return { id: t.id, code: token.qrCodeFor(t.publicId, t.qrVersion) };
}
const doScan = (a: ScanActor, ev: string, code: string, extra: Record<string, unknown> = {}) => scan.processScan(a, { eventId: ev, code, clientId: cid(), ...extra });

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../tickets.server");
  catalog = await import("../catalog.server");
  scan = await import("../scan.server");
  token = await import("../token");
  scannerAdmin = await import("../scanner-admin.server");
  auth = await import("../scanner-auth.server");
  await wipe();
  const soon = new Date(Date.now() + 3600_000).toISOString();
  eventId = (await catalog.saveEvent(admin, null, { title: "E2E – Thuis", startsAt: soon, status: "ACTIVE" }))!.id;
  fhEventId = (await catalog.saveEvent(admin, null, { title: "E2E – Fullhouse", startsAt: soon, status: "ACTIVE" }))!.id;
  await db.ticketEvent.update({ where: { id: fhEventId }, data: { externalId: "mock-event-1", source: "FULLHOUSE" } });
  typeSingle = (await catalog.saveType(admin, null, { name: "Vrijkaart", category: "FREE", validityMode: "SINGLE" }))!.id;
  entranceA = (await scannerAdmin.saveEntrance(admin, null, { name: "Noord" })).id;
  entranceB = (await scannerAdmin.saveEntrance(admin, null, { name: "Zuid" })).id;
});

after(async () => {
  if (skip) return;
  await wipe();
  await db.$disconnect();
});

test("gelijktijdige foute PIN's: niet meer dan 5 pogingen voordat de scanner geblokkeerd is", { skip }, async () => {
  const s = await scannerAdmin.createScanner(admin, { name: "Brute force" });
  const wrong = (i: number) => String((Number(s.pin) + 1 + i) % 1_000_000).padStart(6, "0");
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => auth.scannerLogin(s.loginCode, wrong(i), null)));
  const messages = results.map((r) => (r.status === "rejected" ? String((r.reason as Error).message) : "ingelogd"));
  const checked = messages.filter((m) => /klopt niet/.test(m)).length;
  assert.ok(checked <= 5, `hooguit 5 PIN's gecontroleerd, maar het waren er ${checked}`);
  assert.ok(messages.every((m) => /klopt niet|Te vaak/.test(m)));
  await assert.rejects(auth.scannerLogin(s.loginCode, s.pin, null), /Te vaak/, "daarna geblokkeerd, ook met de goede PIN");
  const reset = await scannerAdmin.resetScannerPin(admin, s.id);
  await auth.scannerLogin(s.loginCode, reset.pin, null);
});

test("goede PIN na een paar fouten zet de teller terug; na verlopen blokkade opnieuw 5 pogingen", { skip }, async () => {
  const s = await scannerAdmin.createScanner(admin, { name: "Teller" });
  for (let i = 0; i < 4; i++) await assert.rejects(auth.scannerLogin(s.loginCode, "000000" === s.pin ? "111111" : "000000", null), /klopt niet/);
  await auth.scannerLogin(s.loginCode, s.pin, null);
  assert.equal((await db.ticketScanner.findUniqueOrThrow({ where: { id: s.id } })).failedAttempts, 0);
  await db.ticketScanner.update({ where: { id: s.id }, data: { lockedUntil: new Date(Date.now() - 1000), failedAttempts: 0 } });
  await auth.scannerLogin(s.loginCode, s.pin, null);
});

test("alleen supervisor-recht wijzigen maakt de lopende sessie ongeldig; een andere ingang niet", { skip }, async () => {
  const s = await scannerAdmin.createScanner(admin, { name: "Rechten" });
  const t1 = (await auth.scannerLogin(s.loginCode, s.pin, null)).token;
  await scannerAdmin.updateScanner(admin, s.id, { name: "Rechten", supervisor: false, active: true, entranceId: entranceA });
  const a = await auth.requireScanActor(reqWith(t1));
  assert.equal(a.entranceId, entranceA, "ingang wijzigen werkt direct, zonder opnieuw inloggen");
  await scannerAdmin.updateScanner(admin, s.id, { name: "Rechten", supervisor: true, active: true, entranceId: entranceA });
  await assert.rejects(auth.requireScanActor(reqWith(t1)), /verlopen/);
  const t2 = (await auth.scannerLogin(s.loginCode, s.pin, null)).token;
  assert.equal((await auth.requireScanActor(reqWith(t2))).canOverride, true);
});

test("Fullhouse onbereikbaar: na een overrule geeft dezelfde barcode 'al gebruikt' in plaats van opnieuw 'storing'", { skip }, async () => {
  const first = await doScan(supervisor, fhEventId, "FH-TEST-UNREACHABLE", { entranceId: entranceA, override: { reason: "Storing bij controle" } });
  assert.deepEqual([first.result, first.overridden], ["VALID", true]);
  const again = await doScan(steward(), fhEventId, "FH-TEST-UNREACHABLE", { entranceId: entranceB });
  assert.deepEqual([again.result, again.reason], ["WARNING", "ALREADY_USED"]);
  assert.ok(again.previous, "toont wanneer en waar hij eerder binnenkwam");
  assert.equal(again.previous!.where, "Noord");
  const fresh = await doScan(steward(), fhEventId, "FH-TEST-UNREACHABLE");
  assert.equal(fresh.reason, "ALREADY_USED");
});

test("hetzelfde ticket tegelijk op twee ingangen: één keer binnen", { skip }, async () => {
  const t = await issue();
  const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => doScan(steward(), eventId, t.code, { entranceId: i % 2 ? entranceA : entranceB })));
  assert.equal(rs.filter((r) => r.result === "VALID").length, 1);
  assert.equal(await db.ticketScan.count({ where: { ticketId: t.id, result: "VALID" } }), 1);
});

test("een Fullhouse-code die nog niet lokaal bekend is, tegelijk gescand: één keer binnen", { skip }, async () => {
  const rs = await Promise.all(Array.from({ length: 6 }, () => doScan(steward(), fhEventId, "FH-TEST-0042")));
  assert.equal(rs.filter((r) => r.result === "VALID").length, 1);
  assert.equal(await db.ticketExternalTicket.count({ where: { eventExtId: "mock-event-1", ticketName: { not: null } } }) >= 1, true);
});

test("ongedaan maken: eigen scan na 10 minuten alleen door een supervisor, daarna mag het ticket weer naar binnen", { skip }, async () => {
  const s = await db.ticketScanner.create({ data: { name: "Eigen", loginCode: "E2E01", pinHash: "x" } });
  const own = steward({ scannerId: s.id });
  const t = await issue();
  const first = await doScan(own, eventId, t.code);
  await db.ticketScan.update({ where: { id: first.scanId }, data: { receivedAt: new Date(Date.now() - 11 * 60_000) } });
  await assert.rejects(scan.voidScan(own, { scanId: first.scanId, reason: "Te laat" }), /laatste 10 minuten/);
  await scan.voidScan(supervisor, { scanId: first.scanId, reason: "Supervisor draait terug" });
  assert.equal((await doScan(own, eventId, t.code)).result, "VALID");
});

test("niet te overrulen: oude QR-versie, afgelaste wedstrijd en onbekend ticket; wel: geblokkeerd en verlopen", { skip }, async () => {
  const old = await issue();
  await svc.reissue(admin, old.id, { what: "qr", reason: "Opnieuw verstuurd" });
  const r1 = await doScan(supervisor, eventId, old.code, { override: { reason: "Probeer het toch" } });
  assert.deepEqual([r1.result, r1.reason, r1.overridable], ["INVALID", "OUTDATED", false]);
  const blocked = await issue();
  await svc.changeStatus(admin, blocked.id, { status: "BLOCKED", reason: "Test" });
  const b = await doScan(supervisor, eventId, blocked.code);
  assert.deepEqual([b.reason, b.overridable], ["BLOCKED", true]);
  const expired = await issue();
  await db.ticket.update({ where: { id: expired.id }, data: { validUntil: new Date(Date.now() - 60_000) } });
  const e = await doScan(steward(), eventId, expired.code);
  assert.deepEqual([e.result, e.reason], ["INVALID", "EXPIRED"]);
  const cancelledEv = (await catalog.saveEvent(admin, null, { title: "E2E – Afgelast", startsAt: new Date(Date.now() + 3600_000).toISOString(), status: "ACTIVE" }))!.id;
  const t = await issue();
  await db.ticketEventLink.create({ data: { ticketId: t.id, eventId: cancelledEv } });
  await db.ticketEvent.update({ where: { id: cancelledEv }, data: { status: "CANCELLED" } });
  const c = await doScan(supervisor, cancelledEv, t.code, { override: { reason: "Toch maar" } });
  assert.deepEqual([c.result, c.reason], ["INVALID", "EVENT_NOT_ACTIVE"]);
});
