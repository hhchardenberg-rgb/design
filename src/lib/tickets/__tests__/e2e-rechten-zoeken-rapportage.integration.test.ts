// Rechten, zoektool, rapportages en Fullhouse-storingen tegen een echte Postgres.
// Wordt overgeslagen zonder TEST_DATABASE_URL. Fullhouse draait op de testprovider (geen netwerk).
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { TicketsActor } from "../authz.server";
import { ALL_TICKET_PERMISSIONS, TICKET_ROLE_TEMPLATES, ticketsNeedsMfa, type TicketPermission } from "../permissions";
import { checkAssignment, checkRoleEdit, type ManagerScope } from "@/lib/access/model";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;
delete process.env.FULLHOUSE_MODE;
process.env.TICKETS_ENABLED = "true";

let db: typeof import("@/lib/prisma")["prisma"];
let svc: typeof import("../tickets.server");
let catalog: typeof import("../catalog.server");
let search: typeof import("../support-search.server");
let reports: typeof import("../reports.server");
let matchday: typeof import("../matchday.server");
let sync: typeof import("../fullhouse/sync.server");
let fullhouse: typeof import("../fullhouse");

function actor(id: string, perms: readonly TicketPermission[]): TicketsActor {
  const set = new Set(perms);
  return { id, name: `Test ${id}`, access: { userId: id, isSuperadmin: false, hasAccess: true, permissions: [...perms], can: (p) => set.has(p) } };
}
const admin = actor("admin", ALL_TICKET_PERMISSIONS);

async function wipe() {
  await db.ticketScan.deleteMany();
  await db.ticketExternalTicket.deleteMany();
  await db.ticketSyncRun.deleteMany();
  await db.ticketEventLink.deleteMany();
  await db.ticketDelivery.deleteMany();
  await db.ticket.deleteMany();
  await db.ticketType.deleteMany();
  await db.ticketEvent.deleteMany();
  await db.ticketZone.deleteMany();
  await db.ticketAuditEvent.deleteMany();
  await db.ticketPublicHit.deleteMany();
}

let pastEventId = "";
let pastTicketPublicId = "";
let letterTicketId = "";

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../tickets.server");
  catalog = await import("../catalog.server");
  search = await import("../support-search.server");
  reports = await import("../reports.server");
  matchday = await import("../matchday.server");
  sync = await import("../fullhouse/sync.server");
  fullhouse = await import("../fullhouse");
  await wipe();
  const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const eventId = (await catalog.saveEvent(admin, null, { title: "HHC – E2E-test", startsAt: inAWeek, status: "ACTIVE" }))!.id;
  const typeId = (await catalog.saveType(admin, null, { name: "Vrijkaart", category: "FREE", validityMode: "SINGLE" }))!.id;
  const holders = [
    { firstName: "Anna", lastName: "de Vries", email: "anna@test.nl", company: "100%_korting BV" },
    { firstName: "Bert", lastName: "Jansen", email: "bert@test.nl" },
    { firstName: "Carla", lastName: "Bakker", email: "carla@test.nl" },
  ];
  const r = (await svc.issueTickets(admin, { typeId, eventIds: [eventId], holders })) as { ticketIds: string[] };
  // Een ticketkenmerk zonder cijfers (komt bij ongeveer 1 op 400 tickets voor).
  letterTicketId = r.ticketIds[1];
  await db.ticket.update({ where: { id: letterTicketId }, data: { publicId: "ABCDEFGHJKMNPQRS" } });

  // Een gespeelde wedstrijd: het ticket is inmiddels verlopen, de scan staat er nog.
  const past = await catalog.saveEvent(admin, null, { title: "HHC – gespeeld", startsAt: inAWeek, status: "ACTIVE" });
  pastEventId = past!.id;
  const p = (await svc.issueTickets(admin, { typeId, eventIds: [pastEventId], holders: [{ firstName: "Dirk", lastName: "Verleden" }] })) as { ticketIds: string[] };
  await db.ticketEvent.update({ where: { id: pastEventId }, data: { startsAt: new Date("2025-03-01T14:30:00Z"), endsAt: new Date("2025-03-01T16:30:00Z") } });
  const t = await db.ticket.update({ where: { id: p.ticketIds[0] }, data: { validUntil: new Date("2025-03-02T03:00:00Z") } });
  pastTicketPublicId = t.publicId;
  await db.ticketScan.create({ data: { clientId: "e2e-past-scan-1", scannedAt: new Date("2025-03-01T14:00:00Z"), eventId: pastEventId, source: "HHC", ticketId: t.id, result: "VALID" } });
});

after(async () => {
  if (skip) return;
  await wipe();
  await db.$disconnect();
});

// ── Rechten ──

test("verplichte tweestapsverificatie: elk rolsjabloon behalve Scanner", () => {
  for (const t of TICKET_ROLE_TEMPLATES) assert.equal(ticketsNeedsMfa(t.permissions), t.key !== "scanner", t.key);
  assert.equal(ticketsNeedsMfa([]), false);
});

test("Tickets-rechten: hoofdadmin alles, Klantenservice-beheerder alleen wat hij zelf heeft", () => {
  const base: ManagerScope = { userId: "m", full: false, hubAdmin: true, ticketingAdmin: true, commercialManage: true, commercialGrantable: new Set(["rights:manage_rights"]), ticketsGrantable: new Set(["support:search"]) };
  const grant = (tickets: string[] | null, ticketingLevel: "NONE" | "USER" = "USER") => ({ isAdmin: false, hubLevel: "USER" as const, ticketingLevel, commercial: null, tickets });
  // Niet zelf in bezit, of een pure Tickets-rol (zonder Klantenservice): alleen de hoofdadmin.
  for (const g of [grant(["scan:scan"]), grant([], "NONE"), grant(["support:search"], "NONE")]) {
    assert.equal(checkRoleEdit(base, null, g).ok, false);
    assert.equal(checkRoleEdit(base, g, grant(null)).ok, false, "rechten weghalen ook niet");
    assert.equal(checkAssignment(base, { userId: "x", isAdmin: false }, [g]).ok, false);
    assert.equal(checkRoleEdit({ ...base, full: true }, null, g).ok, true);
  }
  // Klantenservice-rol met alleen eigen bevoegdheden: mag.
  assert.equal(checkAssignment(base, { userId: "x", isAdmin: false }, [grant(["support:search"])]).ok, true);
  assert.equal(checkAssignment({ ...base, ticketingAdmin: false }, { userId: "x", isAdmin: false }, [grant(["support:search"])]).ok, false);
});

test("Tickets uit: API en scannerlogin geven 404 vóór iets anders", { skip }, async () => {
  const authz = await import("../authz.server");
  const scannerAuth = await import("../scanner-auth.server");
  process.env.TICKETS_ENABLED = "false";
  try {
    await assert.rejects(authz.requireTickets("dashboard:read"), (e: { status?: number }) => e.status === 404);
    await assert.rejects(scannerAuth.scannerLogin("ABCDE", "123456", null), (e: { status?: number }) => e.status === 404);
  } finally {
    process.env.TICKETS_ENABLED = "true";
  }
});

// ── Zoektool ──

const find = (q: string, kind?: string) => search.supportSearch(admin, kind ? { q, kind } : { q }, { skipLimit: true });

test("zoektool: % en _ zijn gewone tekens, geen jokers (geen omweg om de hele klantenlijst te zien)", { skip }, async () => {
  assert.equal((await find("%%%")).hhc.count, 0);
  assert.equal((await find("___")).hhc.count, 0);
  assert.equal((await find("____", "ticket")).hhc.count, 0);
  assert.equal((await find("%%%%", "ticket")).hhc.count, 0);
  // Een echt procentteken in de bedrijfsnaam is wel vindbaar.
  const hit = await find("100%_k", "name");
  assert.equal(hit.hhc.count, 1);
  assert.equal(hit.hhc.customers[0].name, "Anna de Vries");
});

test("zoektool: een nul-teken of ander stuurteken geeft geen serverfout", { skip }, async () => {
  const r = await find("Ann\u0000a");
  assert.equal(r.hhc.count, 1);
});

test("zoektool: ticketkenmerk zonder cijfers wordt automatisch herkend", { skip }, async () => {
  const r = await find("ABCDEFGHJKMNPQRS");
  assert.equal(r.hhc.count, 1);
  assert.equal(r.hhc.customers[0].name, "Bert Jansen");
  assert.equal((await find("abcdefghjkmnpqrs")).hhc.count, 1);
});

test("wedstrijddag handmatig zoeken: % is geen joker", { skip }, async () => {
  assert.equal((await matchday.manualSearch(admin, "%%")).rows.length, 0);
  assert.equal((await matchday.manualSearch(admin, "__")).rows.length, 0);
});

test("ticketoverzicht zoeken: % is geen joker", { skip }, async () => {
  const r = (await svc.listTickets(admin, { q: "%%" })) as { total: number };
  assert.equal(r.total, 0);
});

// ── Rapportages ──

test("rapport van een gespeelde wedstrijd telt de inmiddels verlopen tickets nog mee", { skip }, async () => {
  const rep = await reports.eventReport(admin, pastEventId);
  assert.deepEqual(rep.hhc, { issued: 1, admitted: 1, notYetScanned: 0 });
  assert.deepEqual(rep.byType.map((t) => [t.name, t.issued, t.admitted]), [["Vrijkaart", 1, 1]]);
  const csv = await reports.buildExport(admin, "tickets", "csv", pastEventId);
  assert.match(String(csv.body), new RegExp(pastTicketPublicId));
});

test("export: velden die met = + - @ beginnen worden onschadelijk gemaakt", { skip }, async () => {
  const typeId = (await db.ticketType.findFirstOrThrow()).id;
  const eventId = (await db.ticketEvent.findFirstOrThrow({ where: { title: "HHC – E2E-test" } })).id;
  await svc.issueTickets(admin, { typeId, eventIds: [eventId], holders: [{ firstName: "=HYPERLINK(\"http://x\")", lastName: "+31612345678", email: "csv@test.nl", company: "@SUM(A1)", relation: "-2+3" }] });
  const csv = String((await reports.buildExport(admin, "tickets", "csv", eventId)).body);
  const line = csv.split("\r\n").find((l) => l.includes("csv@test.nl"))!;
  assert.ok(line.includes(`"'=HYPERLINK(""http://x"")"`), line);
  assert.ok(line.includes(";'+31612345678;"), line);
  assert.ok(line.includes(";'@SUM(A1);'-2+3"), line);
});

// ── Fullhouse ──

test("webhook: geldige handtekening maar body 'null' geeft 400, geen serverfout", { skip }, async () => {
  process.env.FULLHOUSE_WEBHOOK_SECRET = "e2e-webhook-secret";
  const { POST } = await import("@/app/api/webhooks/fullhouse/route");
  const post = (body: string) =>
    POST(new Request("http://localhost/api/webhooks/fullhouse", { method: "POST", body, headers: { "x-vivenu-signature": createHmac("sha256", "e2e-webhook-secret").update(body).digest("hex") } }));
  assert.equal((await post("null")).status, 400);
  assert.equal((await post("[1,2]")).status, 200);
  const ok = await post(JSON.stringify({ type: "ticket.updated", data: { eventId: "onbekend" } }));
  assert.equal(ok.status, 200);
  assert.equal((await post("{")).status, 400);
  const wrong = await POST(new Request("http://localhost/api/webhooks/fullhouse", { method: "POST", body: "{}", headers: { "x-vivenu-signature": "00".repeat(32) } }));
  assert.equal(wrong.status, 401);
});

test("storing bij Fullhouse halverwege een volledige synchronisatie: niets wordt ongeldig gemaakt", { skip }, async () => {
  await sync.importFullhouseEvents(admin);
  const first = await sync.syncEventTickets({ id: null, name: "Test" }, "mock-event-1", { full: true });
  assert.equal(first.fetched, 51);
  const provider = fullhouse.ticketProvider();
  const original = provider.fetchTicketsPage;
  const { FullhouseError } = await import("../fullhouse/types");
  provider.fetchTicketsPage = async (eventId, opts) => {
    if (opts.skip > 0) throw new FullhouseError("Fullhouse is niet bereikbaar.", "network");
    const page = await original(eventId, { ...opts, top: 10 });
    return { tickets: page.tickets, total: page.total };
  };
  try {
    await assert.rejects(sync.syncEventTickets({ id: null, name: "Test" }, "mock-event-1", { full: true }));
  } finally {
    provider.fetchTicketsPage = original;
  }
  const lastRun = await db.ticketSyncRun.findFirstOrThrow({ where: { kind: "tickets" }, orderBy: { startedAt: "desc" } });
  assert.equal(lastRun.status, "FAILED");
  assert.equal(await db.ticketExternalTicket.count({ where: { eventExtId: "mock-event-1", status: "VALID" } }), 50);
});

test("zoektool bij storing van Fullhouse: barcode uit de eigen kopie, zonder e-mail en alleen initialen", { skip }, async () => {
  const provider = fullhouse.ticketProvider();
  const original = provider.searchHolders;
  const { FullhouseError } = await import("../fullhouse/types");
  provider.searchHolders = async () => {
    throw new FullhouseError("Fullhouse is niet bereikbaar.", "network");
  };
  try {
    const r = await find("FH-TEST-0007");
    assert.equal(r.fullhouse.state, "local");
    assert.equal(r.fullhouse.count, 1);
    assert.equal(r.fullhouse.customers[0].email, null);
    assert.equal(r.fullhouse.customers[0].name, "T. 7");
    const byName = await find("Testbezoeker");
    assert.equal(byName.fullhouse.state, "unavailable");
  } finally {
    provider.searchHolders = original;
  }
});

test("een preview gebruikt nooit de productie-API van Fullhouse", { skip }, async () => {
  const saved = { mode: process.env.FULLHOUSE_MODE, env: process.env.VERCEL_ENV, key: process.env.FULLHOUSE_API_KEY };
  try {
    process.env.FULLHOUSE_MODE = "production";
    process.env.VERCEL_ENV = "preview";
    process.env.FULLHOUSE_API_KEY = "e2e-nep-sleutel";
    fullhouse.resetTicketProvider();
    assert.equal(fullhouse.fullhouseMode(), "mock");
    assert.equal(fullhouse.ticketProvider().mode, "mock");
  } finally {
    for (const [k, v] of [["FULLHOUSE_MODE", saved.mode], ["VERCEL_ENV", saved.env], ["FULLHOUSE_API_KEY", saved.key]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fullhouse.resetTicketProvider();
  }
});
