// Integratietest voor de zoektool in Klantenservice. Wordt overgeslagen zonder TEST_DATABASE_URL.
// Fullhouse draait hier op de testprovider (geen netwerk).
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { TicketsActor } from "../authz.server";
import { ALL_TICKET_PERMISSIONS, type TicketPermission } from "../permissions";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;
delete process.env.FULLHOUSE_MODE;

type Db = typeof import("@/lib/prisma");
let db: Db["prisma"];
let svc: typeof import("../tickets.server");
let catalog: typeof import("../catalog.server");
let search: typeof import("../support-search.server");
let scan: typeof import("../scan.server");

function actor(id: string, perms: readonly TicketPermission[]): TicketsActor {
  const set = new Set(perms);
  return { id, name: `Test ${id}`, access: { userId: id, isSuperadmin: false, hasAccess: true, permissions: [...perms], can: (p) => set.has(p) } };
}
const admin = actor("admin", ALL_TICKET_PERMISSIONS);
const support = actor("support", ["support:search", "tickets:read", "tickets:resend"]);
const noRight = actor("geen", ["tickets:read", "tickets:personal"]);

async function wipe() {
  await db.ticketScan.deleteMany();
  await db.ticketEventLink.deleteMany();
  await db.ticketDelivery.deleteMany();
  await db.ticket.deleteMany();
  await db.ticketType.deleteMany();
  await db.ticketEvent.deleteMany();
  await db.ticketZone.deleteMany();
  await db.ticketAuditEvent.deleteMany();
  await db.ticketPublicHit.deleteMany();
}

let ticketId = "";
let publicId = "";

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../tickets.server");
  catalog = await import("../catalog.server");
  search = await import("../support-search.server");
  scan = await import("../scan.server");
  await wipe();
  const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const eventId = (await catalog.saveEvent(admin, null, { title: "HHC – Zoektest", startsAt: inAWeek, status: "ACTIVE" }))!.id;
  const type = (await catalog.saveType(admin, null, { name: "Vrijkaart", category: "FREE", validityMode: "SINGLE" }))!.id;
  const r = (await svc.issueTickets(admin, { typeId: type, eventIds: [eventId], holders: [{ firstName: "Petra", lastName: "de Vries", email: "petra.devries@test.nl" }] })) as { ticketIds: string[] };
  ticketId = r.ticketIds[0];
  publicId = (await db.ticket.findUniqueOrThrow({ where: { id: ticketId } })).publicId;
  await db.ticketScan.create({ data: { clientId: "scan-test-hhc-1", scannedAt: new Date(), eventId, source: "HHC", ticketId, result: "VALID" } });
  // Fullhouse-wedstrijd uit de testprovider, afgelast, met een scan van FH-TEST-0003.
  const fh = await db.ticketEvent.create({ data: { title: "Fullhouse-testwedstrijd", startsAt: new Date(inAWeek), endsAt: new Date(Date.now() + 8 * 86_400_000), status: "CANCELLED", source: "FULLHOUSE", externalId: "mock-event-1" } });
  await db.ticketScan.create({ data: { clientId: "scan-test-fh-1", scannedAt: new Date(), eventId: fh.id, source: "FULLHOUSE", codeHash: scan.codeHash("FH-TEST-0004"), result: "VALID" } });
});

after(async () => {
  if (skip) return;
  await wipe();
  await db.$disconnect();
});

test("zonder recht support:search geen toegang", { skip }, async () => {
  await assert.rejects(search.supportSearch(noRight, { q: "Petra" }), /bevoegdheid/);
});

test("op naam: HHC-klant met status, scan en gemaskeerd e-mailadres; auditregel zonder volledige term", { skip }, async () => {
  const r = await search.supportSearch(support, { q: "petra vries" });
  assert.equal(r.kind, "name");
  assert.equal(r.hhc.customers.length, 1);
  const c = r.hhc.customers[0];
  assert.equal(c.name, "Petra de Vries");
  assert.equal(c.email, "p•••@test.nl");
  assert.equal(c.tickets[0].status, "SCANNED");
  assert.equal(c.tickets[0].scans.length, 1);
  assert.equal(c.tickets[0].canResend, true);
  const audit = await db.ticketAuditEvent.findFirstOrThrow({ where: { action: "support.search", actorId: "support" }, orderBy: { at: "desc" } });
  const meta = audit.meta as { term: string; hhc: number };
  assert.equal(meta.term, "p••• v•••");
  assert.equal(meta.hhc, 1);
  assert.ok(!JSON.stringify(audit).includes("petra"), "volledige zoekterm staat niet in het auditlog");
});

test("met tickets:personal het volledige e-mailadres; zoeken op e-mail en ticketnummer", { skip }, async () => {
  const r = await search.supportSearch(admin, { q: "Petra.DeVries@test.nl" });
  assert.equal(r.kind, "email");
  assert.equal(r.hhc.customers[0].email, "petra.devries@test.nl");
  const byId = await search.supportSearch(admin, { q: publicId.toLowerCase(), kind: "ticket" });
  assert.equal(byId.hhc.count, 1);
});

test("Fullhouse (testprovider): kopergegevens, afgelaste wedstrijd en scanhistorie uit de eigen scanner", { skip }, async () => {
  const r = await search.supportSearch(support, { q: "mock-order-2", kind: "order" });
  assert.equal(r.fullhouse.state, "test");
  assert.equal(r.fullhouse.count, 2);
  const tickets = r.fullhouse.customers.flatMap((c) => c.tickets);
  const t4 = tickets.find((t) => t.barcode === "••••0004")!;
  assert.equal(t4.status, "CANCELLED_EVENT");
  assert.equal(t4.scans.length, 1);
  assert.equal(t4.event?.title, "Fullhouse-testwedstrijd");
  assert.ok(r.fullhouse.customers.every((c) => !c.email || c.email.includes("•••")));
  assert.ok(!JSON.stringify(r).includes("FH-TEST-0004"), "volledige barcode gaat nooit naar de browser");
});

test("te korte zoekterm en limiet per medewerker", { skip }, async () => {
  await assert.rejects(search.supportSearch(support, { q: "ab", kind: "name" }), /minstens 3/);
  const busy = actor("druk", ["support:search"]);
  for (let i = 0; i < 30; i++) await search.supportSearch(busy, { q: `FH-TEST-00${String(i % 50).padStart(2, "0")}` });
  await assert.rejects(search.supportSearch(busy, { q: "FH-TEST-0001" }), /vaak/);
});
