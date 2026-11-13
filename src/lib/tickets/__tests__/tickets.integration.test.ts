// Integratietest tegen een echte Postgres. Wordt overgeslagen zonder TEST_DATABASE_URL.
// Controleert uitgifte, bulkgoedkeuring (vier ogen), statuswijzigingen, opnieuw uitgeven,
// anonimiseren, afscherming van persoonsgegevens en het auditlog.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { TicketsActor } from "../authz.server";
import { ALL_TICKET_PERMISSIONS, type TicketPermission } from "../permissions";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

type Db = typeof import("@/lib/prisma");
type Svc = typeof import("../tickets.server");
type Batches = typeof import("../batches.server");
type Catalog = typeof import("../catalog.server");
let db: Db["prisma"], svc: Svc, batches: Batches, catalog: Catalog;

function actor(id: string, perms: readonly TicketPermission[] = ALL_TICKET_PERMISSIONS): TicketsActor {
  const set = new Set(perms);
  return { id, name: `Test ${id}`, access: { userId: id, isSuperadmin: false, hasAccess: true, permissions: [...perms], can: (p) => set.has(p) } };
}
const admin = actor("admin-a");
const admin2 = actor("admin-b");
const reader = actor("reader", ["dashboard:read", "events:read", "types:read", "tickets:read"]);

let typeSingle: string, typeSeason: string, eventId: string, cancelledEvent: string, seasonId: string;

async function wipe() {
  await db.ticketPromoClaim.deleteMany();
  await db.ticketPromo.deleteMany();
  await db.ticketEventLink.deleteMany();
  await db.ticket.deleteMany();
  await db.ticketBatch.deleteMany();
  await db.ticketType.deleteMany();
  await db.ticketEvent.deleteMany();
  await db.ticketZone.deleteMany();
  await db.ticketSeason.deleteMany();
  await db.ticketAuditEvent.deleteMany();
  await db.ticketSettings.deleteMany();
}

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../tickets.server");
  batches = await import("../batches.server");
  catalog = await import("../catalog.server");
  await wipe();
  const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const season = await catalog.saveSeason(admin, null, { name: "Test 2099", startsOn: new Date().toISOString().slice(0, 10), endsOn: "2099-06-30" });
  seasonId = season!.id;
  eventId = (await catalog.saveEvent(admin, null, { title: "HHC – Test", startsAt: inAWeek, status: "ACTIVE" }))!.id;
  cancelledEvent = (await catalog.saveEvent(admin, null, { title: "Afgelast", startsAt: inAWeek, status: "CANCELLED" }))!.id;
  const zone = await catalog.saveZone(admin, null, { name: "Tribune" });
  typeSingle = (await catalog.saveType(admin, null, { name: "Vrijkaart", category: "FREE", validityMode: "SINGLE", zoneId: zone!.id }))!.id;
  typeSeason = (await catalog.saveType(admin, null, { name: "Seizoenskaart", category: "SEASON", validityMode: "SEASON", seasonId }))!.id;
});

after(async () => {
  if (skip) return;
  await wipe();
  await db.$disconnect();
});

const holder = (n: number) => ({ firstName: `Voor${n}`, lastName: `Achter${n}`, email: `p${n}@test.nl`, phone: "0612345678" });

test("één ticket uitgeven: koppeling, vervaldatum, standaardvak en auditregel", { skip }, async () => {
  const r = await svc.issueTickets(admin, { typeId: typeSingle, eventIds: [eventId], holders: [holder(1)] });
  assert.equal(r.pendingApproval, false);
  const id = (r as { ticketIds: string[] }).ticketIds[0];
  const t = await db.ticket.findUniqueOrThrow({ where: { id }, include: { links: true } });
  assert.equal(t.status, "ACTIVE");
  assert.equal(t.links.length, 1);
  assert.ok(t.zoneId);
  assert.match(t.publicId, /^[0-9A-Z]{16}$/);
  assert.ok(t.validUntil && t.validUntil > new Date());
  assert.equal(await db.ticketAuditEvent.count({ where: { ticketId: id, action: "ticket.created" } }), 1);
});

test("geen tickets voor een afgelaste wedstrijd en geen seizoenskaart zonder seizoen", { skip }, async () => {
  await assert.rejects(svc.issueTickets(admin, { typeId: typeSingle, eventIds: [cancelledEvent], holders: [holder(2)] }), /afgelaste/);
  const t = await db.ticketType.update({ where: { id: typeSeason }, data: { seasonId: null } });
  await assert.rejects(svc.issueTickets(admin, { typeId: t.id, holders: [holder(2)] }), /seizoen/i);
  await db.ticketType.update({ where: { id: typeSeason }, data: { seasonId } });
  const ok = await svc.issueTickets(admin, { typeId: typeSeason, holders: [holder(3)] });
  assert.equal(ok.count, 1);
});

test("meerdere tickets vereist het bulkrecht", { skip }, async () => {
  const issuer = actor("issuer", ["tickets:read", "tickets:issue", "events:read", "types:read"]);
  await assert.rejects(svc.issueTickets(issuer, { typeId: typeSingle, eventIds: [eventId], holders: [holder(4), holder(5)] }), /bevoegdheid/);
});

test("boven de drempel: aanvraag, niet zelf goedkeuren, wel door een ander", { skip }, async () => {
  await db.ticketSettings.upsert({ where: { id: "default" }, create: { id: "default", bulkApprovalThreshold: 2 }, update: { bulkApprovalThreshold: 2 } });
  const before = await db.ticket.count();
  const r = await svc.issueTickets(admin, { typeId: typeSingle, eventIds: [eventId], holders: [holder(10), holder(11), holder(12)], batchName: "Sponsoravond" });
  assert.equal(r.pendingApproval, true);
  assert.equal(await db.ticket.count(), before);
  const batchId = (r as { batchId: string }).batchId;
  await assert.rejects(batches.reviewBatch(admin, batchId, { decision: "approve" }), /eigen bulkuitgifte/);
  const ok = await batches.reviewBatch(admin2, batchId, { decision: "approve", note: "akkoord" });
  assert.equal(ok.count, 3);
  assert.equal(await db.ticket.count({ where: { batchId } }), 3);
  const b = await db.ticketBatch.findUniqueOrThrow({ where: { id: batchId } });
  assert.equal(b.status, "ISSUED");
  assert.equal(b.payload, null, "persoonsgegevens in de aanvraag worden na uitgifte gewist");
  await assert.rejects(batches.reviewBatch(admin2, batchId, { decision: "approve" }), /al beoordeeld/);
  await db.ticketSettings.update({ where: { id: "default" }, data: { bulkApprovalThreshold: 50 } });
});

test("blokkeren, deblokkeren, annuleren: altijd met reden en in het auditlog", { skip }, async () => {
  const r = (await svc.issueTickets(admin, { typeId: typeSingle, eventIds: [eventId], holders: [holder(20)] })) as { ticketIds: string[] };
  const id = r.ticketIds[0];
  await assert.rejects(svc.changeStatus(admin, id, { status: "BLOCKED", reason: "" }), /reden/);
  await svc.changeStatus(admin, id, { status: "BLOCKED", reason: "Misbruik gemeld" });
  await assert.rejects(svc.changeStatus(admin, id, { status: "BLOCKED", reason: "nogmaals" }), /niet mogelijk/);
  await svc.changeStatus(admin, id, { status: "ACTIVE", reason: "Opgehelderd" });
  await svc.changeStatus(admin, id, { status: "CANCELLED", reason: "Komt niet" });
  const log = await db.ticketAuditEvent.findMany({ where: { ticketId: id }, orderBy: { at: "asc" } });
  assert.deepEqual(
    log.map((l) => [l.action, l.oldStatus, l.newStatus]),
    [
      ["ticket.created", null, "ACTIVE"],
      ["ticket.blocked", "ACTIVE", "BLOCKED"],
      ["ticket.reactivated", "BLOCKED", "ACTIVE"],
      ["ticket.cancelled", "ACTIVE", "CANCELLED"],
    ],
  );
  await assert.rejects(svc.changeStatus(reader, id, { status: "ACTIVE", reason: "mag niet" }), /bevoegdheid/);
});

test("opnieuw uitgeven verhoogt de versie; anonimiseren wist persoonsgegevens en sluit het ticket af", { skip }, async () => {
  const r = (await svc.issueTickets(admin, { typeId: typeSingle, eventIds: [eventId], holders: [holder(30)] })) as { ticketIds: string[] };
  const id = r.ticketIds[0];
  const v = await svc.reissue(admin, id, { what: "qr", reason: "Telefoon kwijt" });
  assert.equal(v.qrVersion, 2);
  await svc.anonymize(admin, id, "Verzoek van betrokkene");
  const t = await db.ticket.findUniqueOrThrow({ where: { id } });
  assert.equal(t.email, null);
  assert.equal(t.phone, null);
  assert.equal(t.status, "CANCELLED");
  assert.ok(t.anonymizedAt);
  assert.equal(await db.ticketEventLink.count({ where: { ticketId: id } }), 1, "koppeling (voor totalen) blijft");
});

test("zonder recht op contactgegevens: alleen initialen en geen zoeken op naam", { skip }, async () => {
  const list = await svc.listTickets(reader, {});
  assert.equal(list.personal, false);
  assert.ok(list.tickets.length > 0);
  for (const t of list.tickets) {
    assert.equal(t.email, null);
    assert.ok(t.name === "Geanonimiseerd" || /^[A-Z]\.[A-Z]?\.?$/.test(t.name), t.name);
  }
  assert.equal((await svc.listTickets(reader, { q: "Voor1" })).total, 0);
  assert.ok((await svc.listTickets(admin, { q: "Voor1" })).total > 0);
  const detail = await svc.getTicket(reader, list.tickets[0].id);
  assert.equal(detail.phone, null);
  assert.equal(detail.canSeePersonal, false);
});
