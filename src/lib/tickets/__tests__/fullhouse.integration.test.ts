// Synchronisatie (met de testprovider) en bewaartermijnen tegen een echte Postgres.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { TicketsActor } from "../authz.server";
import { ALL_TICKET_PERMISSIONS } from "../permissions";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

let db: typeof import("@/lib/prisma")["prisma"];
let sync: typeof import("../fullhouse/sync.server");
let retention: typeof import("../retention.server");
const set = new Set(ALL_TICKET_PERMISSIONS);
const actor: TicketsActor = { id: "a", name: "Admin", access: { userId: "a", isSuperadmin: false, hasAccess: true, permissions: [...ALL_TICKET_PERMISSIONS], can: (p) => set.has(p) } };

async function wipe() {
  await db.ticketScan.deleteMany();
  await db.ticketExternalTicket.deleteMany();
  await db.ticketSyncRun.deleteMany();
  await db.ticketEventLink.deleteMany();
  await db.ticket.deleteMany();
  await db.ticketPromoClaim.deleteMany();
  await db.ticketPromo.deleteMany();
  await db.ticketType.deleteMany();
  await db.ticketEvent.deleteMany();
  await db.ticketDelivery.deleteMany();
  await db.ticketAuditEvent.deleteMany();
}

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  sync = await import("../fullhouse/sync.server");
  retention = await import("../retention.server");
  await wipe();
});
after(async () => {
  if (skip) return;
  await wipe();
  await db.$disconnect();
});

test("evenementen ophalen zet ze als concept neer, zonder dubbelen", { skip }, async () => {
  const a = await sync.importFullhouseEvents(actor);
  assert.equal(a.created, 1);
  assert.equal((await sync.importFullhouseEvents(actor)).created, 0);
  const ev = await db.ticketEvent.findFirstOrThrow({ where: { externalId: "mock-event-1" } });
  assert.deepEqual([ev.status, ev.source, ev.visible], ["DRAFT", "FULLHOUSE", false]);
});

test("tickets synchroniseren: alleen hash en initialen, tweede keer is incrementeel en idempotent", { skip }, async () => {
  const r1 = await sync.syncEventTickets({ id: "a", name: "Admin" }, "mock-event-1");
  assert.equal(r1.full, true);
  assert.equal(r1.fetched, 51);
  const rows = await db.ticketExternalTicket.findMany();
  assert.equal(rows.length, 51);
  assert.ok(rows.every((x) => x.codeHash.length === 64));
  assert.ok(!JSON.stringify(rows).includes("Testbezoeker"), "geen volledige namen bewaard");
  assert.ok(rows.some((x) => x.holderLabel?.startsWith("T. ")));
  const r2 = await sync.syncEventTickets({ id: "a", name: "Admin" }, "mock-event-1");
  assert.equal(r2.full, false);
  assert.equal(await db.ticketExternalTicket.count(), 51);
  const overview = await sync.fullhouseOverview(actor);
  assert.equal(overview.events[0].counts.VALID, 50);
  assert.equal(overview.events[0].counts.INVALID, 1);
  assert.equal(overview.runs.filter((x) => x.status === "OK").length >= 3, true);
});

test("volledige synchronisatie maakt tickets ongeldig die Fullhouse niet meer kent", { skip }, async () => {
  await db.ticketExternalTicket.create({ data: { eventExtId: "mock-event-1", externalId: "weg", codeHash: "x".repeat(64), status: "VALID", syncedAt: new Date(Date.now() - 86_400_000) } });
  const r = await sync.syncEventTickets({ id: "a", name: "Admin" }, "mock-event-1", { full: true });
  assert.equal(r.removed, 1);
  assert.equal((await db.ticketExternalTicket.findFirstOrThrow({ where: { externalId: "weg" } })).status, "INVALID");
});

test("bewaartermijn: oude tickets worden geanonimiseerd, oude scans en logs verwijderd", { skip }, async () => {
  const type = await db.ticketType.create({ data: { name: "Test", category: "FREE", validityMode: "SINGLE" } });
  const old = new Date(Date.now() - 800 * 86_400_000);
  const mk = (n: string, validUntil: Date) => db.ticket.create({ data: { publicId: `RET${n}`.padEnd(16, "0"), firstName: "Piet", lastName: "Oud", email: "p@test.nl", category: "FREE", typeId: type.id, validityMode: "SINGLE", validUntil } });
  const a = await mk("A", old);
  const b = await mk("B", new Date(Date.now() + 86_400_000));
  await db.ticketScan.create({ data: { clientId: "ret-old-scan", scannedAt: old, eventId: "x", source: "HHC", result: "VALID" } });
  await db.ticketScan.create({ data: { clientId: "ret-new-scan", scannedAt: new Date(), eventId: "x", source: "HHC", result: "VALID" } });
  const r = await retention.runTicketRetention();
  assert.equal(r.anonymized, 1);
  const ra = await db.ticket.findUniqueOrThrow({ where: { id: a.id } });
  assert.equal(ra.email, null);
  assert.ok(ra.anonymizedAt);
  assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: b.id } })).email, "p@test.nl");
  assert.equal(await db.ticketScan.count({ where: { clientId: { startsWith: "ret-" } } }), 1);
  await db.ticketScan.deleteMany();
  await db.ticket.deleteMany();
  await db.ticketType.deleteMany();
});
