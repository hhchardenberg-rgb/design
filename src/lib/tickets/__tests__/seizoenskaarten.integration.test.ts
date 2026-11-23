// Seizoenskaarten tegen een echte Postgres (TEST_DATABASE_URL, anders overgeslagen): duels automatisch aan het seizoen,
// uitgesloten duels, dubbel scannen, oude tijden omzetten en aanwezigheid per houder en per duel (ook als Excel).
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
let sp: typeof import("../seasonpass.server");
let link: typeof import("../season-link.server");

const set = new Set(ALL_TICKET_PERMISSIONS);
const actor = (perms: string[]): TicketsActor => {
  const s = new Set(perms);
  return { id: "admin-sk", name: "Admin", access: { userId: "admin-sk", isSuperadmin: false, hasAccess: true, permissions: perms as TicketsActor["access"]["permissions"], can: (p) => s.has(p) } };
};
const admin = actor([...set]);
const steward = (over: Partial<ScanActor> = {}): ScanActor => ({ kind: "scanner", name: "Poort", scannerId: null, userId: null, entranceId: null, canOverride: false, canSeeStats: false, ...over });

let seasonId: string, typeSeason: string, typeSingle: string;
let n = 0;
const cid = () => `sk-client-${Date.now()}-${n++}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function wipe() {
  await db.ticketScan.deleteMany();
  await db.ticketScanner.deleteMany();
  await db.ticketEntrance.deleteMany();
  await db.ticketExternalTicket.deleteMany();
  await db.ticketFullhouseItem.deleteMany();
  await db.ticketSyncRun.deleteMany();
  await db.ticketEventLink.deleteMany();
  await db.ticket.deleteMany();
  await db.ticketBatch.deleteMany();
  await db.ticketType.deleteMany();
  await db.ticketEvent.deleteMany();
  await db.ticketZone.deleteMany();
  await db.ticketSeason.deleteMany();
  await db.ticketAuditEvent.deleteMany();
}

async function issue(typeId: string, eventIds: string[] = [], who = { firstName: "Anna", lastName: "de Vries" }) {
  const r = (await svc.issueTickets(admin, { typeId, eventIds, holders: [{ ...who, email: "a@test.nl" }] })) as { ticketIds: string[] };
  const t = await db.ticket.findUniqueOrThrow({ where: { id: r.ticketIds[0] } });
  return { id: t.id, code: token.qrCodeFor(t.publicId, t.qrVersion) };
}
const doScan = (a: ScanActor, eventId: string, code: string) => scan.processScan(a, { eventId, code, clientId: cid() });

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../tickets.server");
  catalog = await import("../catalog.server");
  scan = await import("../scan.server");
  token = await import("../token");
  sp = await import("../seasonpass.server");
  link = await import("../season-link.server");
  await wipe();
  seasonId = (await catalog.saveSeason(admin, null, { name: "SK 2099", startsOn: day(-60), endsOn: "2099-06-30" }))!.id;
  typeSeason = (await catalog.saveType(admin, null, { name: "SK Seizoenskaart", category: "SEASON", validityMode: "SEASON", seasonId }))!.id;
  typeSingle = (await catalog.saveType(admin, null, { name: "SK Vrijkaart", category: "FREE", validityMode: "SINGLE" }))!.id;
});

after(async () => {
  if (skip) return;
  await wipe();
  await db.$disconnect();
});

test("nieuwe wedstrijd: automatisch in het seizoen en standaard herintrede aan", { skip }, async () => {
  const ev = (await catalog.saveEvent(admin, null, { title: "SK – Nieuw", startsAt: new Date(Date.now() + 3600_000).toISOString() }))!;
  assert.equal(ev.seasonId, seasonId);
  assert.equal(ev.allowReentry, true);
  assert.equal(ev.excludeSeasonCards, false);
  const card = await issue(typeSeason);
  assert.equal((await doScan(steward(), ev.id, card.code)).result, "VALID");
});

test("Fullhouse-duel komt binnen met seizoen; een kaart die eerder is uitgegeven geldt er direct voor", { skip }, async () => {
  const card = await issue(typeSeason);
  const sync = await import("../fullhouse/sync.server");
  await sync.importEventsAs({ id: null, name: "Test" });
  const ev = await db.ticketEvent.findFirstOrThrow({ where: { externalId: "mock-event-1" } });
  assert.equal(ev.seasonId, seasonId, "Fullhouse-duel valt in het seizoen");
  assert.equal(ev.allowReentry, true);
  assert.equal((await doScan(steward(), ev.id, card.code)).result, "VALID");
});

test("duel zonder seizoen wordt alsnog gekoppeld (ook bestaande duels en een later aangemaakt seizoen)", { skip }, async () => {
  const startsAt = new Date(Date.UTC(2120, 0, 10, 13, 30));
  const loose = await db.ticketEvent.create({ data: { title: "SK – Los", startsAt, endsAt: new Date(startsAt.getTime() + 6 * 3600_000), source: "FULLHOUSE", externalId: `sk-${Date.now()}`, status: "ACTIVE" } });
  assert.equal((await link.linkEventsToSeasons()).linked, 0, "geen seizoen voor 2120");
  const later = (await catalog.saveSeason(admin, null, { name: "SK 2119-2120", startsOn: "2119-07-01", endsOn: "2120-06-30" }))!.id;
  assert.equal((await db.ticketEvent.findUniqueOrThrow({ where: { id: loose.id } })).seasonId, later, "seizoen aanmaken koppelt de duels in die periode");
  await db.ticketEvent.update({ where: { id: loose.id }, data: { seasonId: null } });
  assert.equal((await link.linkEventsToSeasons()).linked, 1);
  assert.equal((await link.linkEventsToSeasons()).linked, 0, "veilig om vaak te draaien");
});

test("uitgesloten duel: seizoenskaart afgewezen met uitleg, los ticket werkt, aanzetten maakt het weer geldig", { skip }, async () => {
  const ev = (await catalog.saveEvent(admin, null, { title: "SK – Beker", startsAt: new Date(Date.now() + 2 * 3600_000).toISOString(), excludeSeasonCards: true }))!;
  assert.equal(ev.excludeSeasonCards, true);
  const card = await issue(typeSeason);
  const r = await doScan(steward(), ev.id, card.code);
  assert.equal(r.result, "INVALID");
  assert.equal(r.reason, "WRONG_EVENT");
  assert.match(r.detail ?? "", /gelden niet voor dit duel/);
  const single = await issue(typeSingle, [ev.id]);
  assert.equal((await doScan(steward(), ev.id, single.code)).result, "VALID");
  // Offline-lijst bevat de seizoenskaart niet.
  const cache = await scan.offlineCache(ev.id);
  const pid = (await db.ticket.findUniqueOrThrow({ where: { id: card.id } })).publicId;
  assert.equal(cache.hhc.some((x) => x.p === pid), false);
  // Weer toestaan.
  await catalog.saveEvent(admin, ev.id, { title: ev.title, startsAt: ev.startsAt.toISOString(), seasonId, excludeSeasonCards: false });
  assert.equal((await doScan(steward(), ev.id, card.code)).result, "VALID");
  assert.equal((await scan.offlineCache(ev.id)).hhc.some((x) => x.p === pid), true);
});

test("uitduel: seizoenskaart (alleen thuis) krijgt de reden 'alleen voor thuisduels'", { skip }, async () => {
  const ev = (await catalog.saveEvent(admin, null, { title: "SK – Uit", startsAt: new Date(Date.now() + 3 * 3600_000).toISOString(), isHome: false }))!;
  const card = await issue(typeSeason);
  const r = await doScan(steward(), ev.id, card.code);
  assert.equal(r.reason, "WRONG_EVENT");
  assert.match(r.detail ?? "", /thuisduels/);
});

test("dubbel scannen op hetzelfde toestel: 'net al gescand', geen tweede binnenkomst; ander toestel: herintrede", { skip }, async () => {
  const ev = (await catalog.saveEvent(admin, null, { title: "SK – Dubbel", startsAt: new Date(Date.now() + 3600_000).toISOString() }))!;
  const gate1 = await db.ticketScanner.create({ data: { name: "SK Poort 1", loginCode: `SK1${n++}`, pinHash: "x" } });
  const gate2 = await db.ticketScanner.create({ data: { name: "SK Poort 2", loginCode: `SK2${n++}`, pinHash: "x" } });
  const card = await issue(typeSeason);
  const first = await doScan(steward({ scannerId: gate1.id }), ev.id, card.code);
  assert.equal(first.result, "VALID");
  const again = await doScan(steward({ scannerId: gate1.id }), ev.id, card.code);
  assert.equal(again.result, "WARNING");
  assert.equal(again.duplicate, true);
  assert.equal(again.overridable, false);
  assert.match(again.detail ?? "", /zojuist/);
  assert.equal(await db.ticketScan.count({ where: { ticketId: card.id, eventId: ev.id, result: "VALID" } }), 1, "telt één keer binnen");
  const other = await doScan(steward({ scannerId: gate2.id }), ev.id, card.code);
  assert.equal(other.result, "VALID");
  assert.equal(other.reentry, true, "ander toestel: gewone herintrede");
  // Zonder herintrede bij een los ticket: tweede toestel geeft de gewone waarschuwing.
  const single = await issue(typeSingle, [ev.id]);
  await doScan(steward({ scannerId: gate1.id }), ev.id, single.code);
  const w = await doScan(steward({ scannerId: gate2.id }), ev.id, single.code);
  assert.equal(w.result, "WARNING");
  assert.equal(!!w.duplicate, false);
});

test("oude geldigheidstijden (UTC) worden eenmalig omgezet naar Nederlandse tijd", { skip }, async () => {
  const card = await issue(typeSeason);
  await db.ticket.update({ where: { id: card.id }, data: { validUntil: new Date("2099-06-30T23:59:59.999Z"), validFrom: new Date("2026-07-01T00:00:00.000Z") } });
  const r = await link.fixLegacyDayBounds();
  assert.ok(r.until >= 1 && r.from >= 1);
  const t = await db.ticket.findUniqueOrThrow({ where: { id: card.id } });
  assert.equal(t.validUntil?.toISOString(), "2099-06-30T21:59:59.999Z");
  assert.equal(t.validFrom?.toISOString(), "2026-06-30T22:00:00.000Z");
  const again = await link.fixLegacyDayBounds();
  assert.deepEqual(again, { until: 0, from: 0 }, "tweede keer doet niets");
});

test("aanwezigheid per duel en per houder, en de Excel-export", { skip }, async () => {
  const at = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
  const played1 = (await catalog.saveEvent(admin, null, { title: "SK – Gespeeld 1", startsAt: at(-20) }))!.id;
  const played2 = (await catalog.saveEvent(admin, null, { title: "SK – Gespeeld 2", startsAt: at(-10) }))!.id;
  const excluded = (await catalog.saveEvent(admin, null, { title: "SK – Oefen", startsAt: at(-5), excludeSeasonCards: true }))!.id;
  const cancelled = (await catalog.saveEvent(admin, null, { title: "SK – Afgelast", startsAt: at(-3), status: "CANCELLED" }))!.id;
  const a = await issue(typeSeason, [], { firstName: "Aad", lastName: "Aanwezig" });
  const b = await issue(typeSeason, [], { firstName: "Bea", lastName: "Afwezig" });
  await db.ticket.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { createdAt: new Date(Date.now() - 30 * 86_400_000) } });
  await db.ticketScan.create({ data: { clientId: cid(), scannedAt: new Date(at(-20)), eventId: played1, source: "HHC", ticketId: a.id, result: "VALID" } });
  await db.ticketScan.create({ data: { clientId: cid(), scannedAt: new Date(at(-10)), eventId: played2, source: "HHC", ticketId: a.id, result: "VALID" } });
  // Een ongedaan gemaakte scan telt niet.
  await db.ticketScan.create({ data: { clientId: cid(), scannedAt: new Date(at(-10)), eventId: played2, source: "HHC", ticketId: b.id, result: "VOIDED" } });

  const byEvent = await sp.seasonAttendanceByEvent(admin, { seasonId });
  const p2 = byEvent.events.find((e) => e.id === played2)!;
  assert.ok(p2.expected >= 2);
  assert.ok(p2.present >= 1);
  assert.equal(byEvent.events.find((e) => e.id === excluded)?.excluded, true);
  assert.equal(byEvent.events.find((e) => e.id === cancelled)?.pct, null);

  const detail = await sp.eventAttendance(admin, played2);
  assert.equal(detail.rows.find((r) => r.id === a.id)?.state, "ATTENDED");
  assert.equal(detail.rows.find((r) => r.id === b.id)?.state, "MISSED");
  assert.equal((await sp.eventAttendance(admin, played2, { filter: "absent" })).rows.some((r) => r.id === a.id), false);
  assert.equal((await sp.eventAttendance(admin, played2, { filter: "present" })).rows.some((r) => r.id === b.id), false);
  assert.equal((await sp.eventAttendance(admin, excluded)).rows.find((r) => r.id === b.id)?.state, "EXCLUDED");

  const holder = await sp.seasonPassDetail(admin, b.id);
  const states = Object.fromEntries(holder.games.map((g) => [g.id, g.state]));
  assert.equal(states[played1], "MISSED");
  assert.equal(states[excluded], "EXCLUDED");
  assert.equal(states[cancelled], "CANCELLED");
  const overview = (await sp.seasonPassOverview(admin, { seasonId })).rows.find((r) => r.id === b.id)!;
  assert.equal(overview.attended, 0);
  assert.ok(overview.eligible >= 2, "afgelast en uitgesloten tellen niet mee");

  // Zonder 'contactgegevens zien': alleen initialen.
  const noPersonal = actor([...set].filter((p) => p !== "tickets:personal"));
  assert.ok(!(await sp.eventAttendance(noPersonal, played2)).rows.some((r) => r.name.includes("Aad")));

  const file = await sp.seasonAttendanceExport(admin, seasonId);
  assert.match(file.name, /\.xlsx$/);
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file.body);
  const wb = await zip.file("xl/workbook.xml")!.async("string");
  assert.match(wb, /Per houder/);
  assert.match(wb, /Per duel/);
  const matrix = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  assert.match(matrix, /Aad Aanwezig/);
  assert.match(matrix, /✓/);
  assert.match(matrix, /✗/);
  assert.ok(await db.ticketAuditEvent.findFirst({ where: { action: "export.created", summary: { contains: "aanwezigheid" } } }));
  await assert.rejects(() => sp.seasonAttendanceExport(actor(["tickets:read"]), seasonId), /bevoegdheid/);
});
