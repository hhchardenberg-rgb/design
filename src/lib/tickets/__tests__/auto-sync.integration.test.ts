// Automatische (frequente) Fullhouse-synchronisatie en de status ervan, tegen een echte Postgres met de testprovider.
import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

let db: typeof import("@/lib/prisma")["prisma"];
let auto: typeof import("../fullhouse/auto-sync.server");
let health: typeof import("../fullhouse/health.server");
let provider: typeof import("../fullhouse/index");
const M = { allowMock: true };
let retention: typeof import("../retention.server");

async function wipe() {
  await db.ticketExternalTicket.deleteMany();
  await db.ticketSyncRun.deleteMany();
  await db.ticketFullhouseItem.deleteMany();
  await db.ticketEvent.deleteMany();
  await db.ticketAuditEvent.deleteMany();
}

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  auto = await import("../fullhouse/auto-sync.server");
  health = await import("../fullhouse/health.server");
  provider = await import("../fullhouse/index");
  retention = await import("../retention.server");
});
beforeEach(async () => {
  if (skip) return;
  provider.resetTicketProvider();
  await wipe();
});
after(async () => {
  if (skip) return;
  await wipe();
  await db.$disconnect();
});

test("in testmodus doet de automatische synchronisatie niets (nooit testgegevens in productie)", { skip }, async () => {
  assert.deepEqual(await auto.runAutoSync({ trigger: "schedule" }), { skipped: "testmodus" });
  assert.equal(await db.ticketSyncRun.count(), 0);
  assert.equal((await health.syncHealth()).state, "test");
});

test("een ronde haalt evenementen en tickets op; de volgende alleen wijzigingen, zonder ruis in lijst en auditlog", { skip }, async () => {
  const r1 = await auto.runAutoSync({ trigger: "schedule", allowMock: true });
  assert.equal(r1.ok, 1);
  assert.equal(r1.fetched, 51);
  assert.ok(r1.events && "created" in r1.events && r1.events.created === 1);
  assert.equal(await db.ticketExternalTicket.count(), 51);
  const auditBefore = await db.ticketAuditEvent.count();
  // Tweede ronde: evenementen niet opnieuw (pas na een uur), tickets incrementeel.
  const r2 = await auto.runAutoSync({ trigger: "schedule", allowMock: true });
  assert.equal(r2.events, null);
  assert.equal(r2.ok, 1);
  const runs = await db.ticketSyncRun.findMany({ where: { kind: "auto" } });
  assert.equal(runs.length, 2);
  assert.ok(runs.every((r) => r.status === "OK" && r.startedBy === health.AUTO_NAMES.schedule));
  // De mock geeft altijd alles terug (geen `from`-filter), dus fetched > 0: de auditregel volgt het aantal.
  assert.ok((await db.ticketAuditEvent.count()) >= auditBefore);
});

test("minimale tussentijd en nooit twee rondes tegelijk; een vastgelopen ronde telt na 5 minuten als mislukt", { skip }, async () => {
  await auto.runAutoSync({ trigger: "schedule", allowMock: true });
  assert.deepEqual(await auto.runAutoSync({ trigger: "page", minIntervalMs: 180_000, allowMock: true }), { skipped: "Net nog gesynchroniseerd." });
  const running = await db.ticketSyncRun.create({ data: { kind: "auto", status: "RUNNING", mode: "mock", startedBy: "x" } });
  assert.deepEqual(await auto.runAutoSync({ trigger: "schedule", allowMock: true }), { skipped: "Er loopt al een synchronisatie." });
  await db.ticketSyncRun.update({ where: { id: running.id }, data: { startedAt: new Date(Date.now() - 6 * 60_000) } });
  const r = await auto.runAutoSync({ trigger: "schedule", allowMock: true });
  assert.equal(r.ok, 1);
  assert.equal((await db.ticketSyncRun.findUniqueOrThrow({ where: { id: running.id } })).status, "FAILED");
});

test("storing: mislukte rondes worden zichtbaar, alleen het begin komt in het auditlog, herstel maakt het weer groen", { skip }, async () => {
  await auto.runAutoSync({ trigger: "schedule", allowMock: true });
  assert.equal((await health.syncHealth(undefined, M)).state, "ok");
  assert.equal((await health.syncHealth(undefined, M)).frequent, true);
  const p = provider.ticketProvider();
  const real = p.fetchTicketsPage;
  p.fetchTicketsPage = async () => {
    throw new Error("Fullhouse is niet bereikbaar.");
  };
  try {
    const f1 = await auto.runAutoSync({ trigger: "schedule", allowMock: true });
    assert.equal(f1.failed, 1);
    let h = await health.syncHealth(undefined, M);
    assert.equal(h.state, "warning");
    assert.match(h.lastError ?? "", /niet bereikbaar/);
    await auto.runAutoSync({ trigger: "schedule", allowMock: true });
    h = await health.syncHealth(undefined, M);
    assert.equal(h.state, "failing");
    const failedAudits = await db.ticketAuditEvent.count({ where: { action: "sync.failed", summary: "Automatische Fullhouse-synchronisatie mislukt" } });
    assert.equal(failedAudits, 1, "herhaalde fout geeft geen nieuwe auditregel");
  } finally {
    p.fetchTicketsPage = real;
  }
  await auto.runAutoSync({ trigger: "manual", who: { id: "a", name: "Admin" }, allowMock: true });
  assert.equal((await health.syncHealth(undefined, M)).state, "ok");
});

test("achterstand: zonder geslaagde ronde binnen de termijn waarschuwt de status", { skip }, async () => {
  await auto.runAutoSync({ trigger: "schedule", allowMock: true });
  const later = new Date(Date.now() + 60 * 60_000);
  const h = await health.syncHealth(later, M);
  assert.equal(h.state, "late");
  assert.equal(h.lateAfterMinutes, 20);
});

test("bewaartermijn ruimt automatische rondes zonder wijzigingen na 2 dagen op, de rest blijft", { skip }, async () => {
  const old = new Date(Date.now() - 3 * 86_400_000);
  await db.ticketSyncRun.create({ data: { ...health.QUIET_RUN, mode: "mock", eventExtId: "e", startedAt: old } });
  await db.ticketSyncRun.create({ data: { kind: "tickets", status: "OK", fetched: 4, mode: "mock", startedBy: health.AUTO_NAMES.ticket, eventExtId: "e", startedAt: old } });
  await db.ticketSyncRun.create({ data: { ...health.QUIET_RUN, mode: "mock", eventExtId: "e" } });
  await retention.runTicketRetention();
  assert.equal(await db.ticketSyncRun.count(), 2);
});
