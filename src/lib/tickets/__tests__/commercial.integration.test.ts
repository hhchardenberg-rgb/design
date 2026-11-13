// Koppeling met Commerciële Zaken en rapportage tegen een echte Postgres.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { TicketsActor } from "../authz.server";
import type { ScanActor } from "../scanner-auth.server";
import { ALL_TICKET_PERMISSIONS } from "../permissions";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

let db: typeof import("@/lib/prisma")["prisma"];
let bridge: typeof import("../commercial-bridge.server");
let catalog: typeof import("../catalog.server");
let reports: typeof import("../reports.server");
let scan: typeof import("../scan.server");
let token: typeof import("../token");
const set = new Set(ALL_TICKET_PERMISSIONS);
const actor: TicketsActor = { id: "a", name: "Admin", access: { userId: "a", isSuperadmin: false, hasAccess: true, permissions: [...ALL_TICKET_PERMISSIONS], can: (p) => set.has(p) } };
const limited: TicketsActor = { id: "r", name: "Lezer", access: { userId: "r", isSuperadmin: false, hasAccess: true, permissions: ["dashboard:read"], can: (p) => p === "dashboard:read" } };
const scanner: ScanActor = { kind: "scanner", name: "S", scannerId: null, userId: null, entranceId: null, canOverride: false, canSeeStats: false };

let typeId: string, eventId: string, seasonId: string;

async function wipe() {
  await db.ticketScan.deleteMany();
  await db.ticketEventLink.deleteMany();
  await db.ticket.deleteMany();
  await db.ticketBatch.deleteMany();
  await db.ticketPromoClaim.deleteMany();
  await db.ticketPromo.deleteMany();
  await db.ticketType.deleteMany();
  await db.ticketEvent.deleteMany();
  await db.ticketSeason.deleteMany();
  await db.ticketAuditEvent.deleteMany();
  await db.ticketBanner.deleteMany();
  await db.ticketPublicHit.deleteMany();
  await db.ticketDelivery.deleteMany();
  await db.ticketSettings.deleteMany();
}

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  bridge = await import("../commercial-bridge.server");
  catalog = await import("../catalog.server");
  reports = await import("../reports.server");
  scan = await import("../scan.server");
  token = await import("../token");
  await wipe();
  seasonId = (await catalog.saveSeason(actor, null, { name: "CZ 2099", startsOn: new Date().toISOString().slice(0, 10), endsOn: "2099-06-30" }))!.id;
  eventId = (await catalog.saveEvent(actor, null, { title: "HHC – CZ-test", startsAt: new Date(Date.now() + 3600_000).toISOString(), status: "ACTIVE", seasonId }))!.id;
  typeId = (await catalog.saveType(actor, null, { name: "Sponsorkaart", category: "SPONSOR", validityMode: "SINGLE" }))!.id;
});
after(async () => {
  if (skip) return;
  await wipe();
  await db.$disconnect();
});

const req = (n: number, over = {}) => ({ originSystem: "commercial", externalRef: `contract:1:quota:${n}`, commercialCompanyId: "bedrijf-1", typeId, eventIds: [eventId], holder: { firstName: `Sponsor${n}`, lastName: "Test", email: `s${n}@bedrijf.nl` }, ...over });

test("uitgeven vanuit CZ is idempotent en legt bron en bedrijf vast", { skip }, async () => {
  const first = await bridge.issueFromCommercial(actor, [req(1), req(2)]);
  assert.deepEqual(first.map((r) => r.status), ["ISSUED", "ISSUED"]);
  const again = await bridge.issueFromCommercial(actor, [req(1), req(2), req(3)]);
  assert.deepEqual(again.map((r) => r.status), ["ALREADY_ISSUED", "ALREADY_ISSUED", "ISSUED"]);
  assert.equal(again[0].ticketId, first[0].ticketId);
  assert.equal(await db.ticket.count({ where: { originSystem: "commercial" } }), 3);
  const t = await db.ticket.findUniqueOrThrow({ where: { id: first[0].ticketId! } });
  assert.equal(t.commercialCompanyId, "bedrijf-1");
  assert.equal(t.externalRef, "contract:1:quota:1");
});

test("een ongeldige aanvraag wordt afgewezen zonder de rest te raken, en zonder recht lukt niets", { skip }, async () => {
  const r = await bridge.issueFromCommercial(actor, [req(10), req(11, { typeId: "bestaat-niet" })]);
  assert.deepEqual(r.map((x) => x.status), ["ISSUED", "REJECTED"]);
  assert.match(r[1].message ?? "", /tickettype/);
  await assert.rejects(bridge.issueFromCommercial(limited, [req(20)]), /bevoegdheid/);
});

test("meer dan de drempel in één keer wordt niet stilletjes uitgegeven", { skip }, async () => {
  await db.ticketSettings.upsert({ where: { id: "default" }, create: { id: "default", bulkApprovalThreshold: 2 }, update: { bulkApprovalThreshold: 2 } });
  const r = await bridge.issueFromCommercial(actor, [req(90), req(91), req(92)]);
  assert.ok(r.every((x) => x.status === "PENDING_APPROVAL"));
  assert.equal(await db.ticket.count({ where: { externalRef: { startsWith: "contract:1:quota:9" } } }), 0);
  await db.ticketSettings.deleteMany();
});

test("gebruik per bedrijf en wedstrijdrapport", { skip }, async () => {
  const t = await db.ticket.findFirstOrThrow({ where: { externalRef: "contract:1:quota:1" } });
  await scan.processScan(scanner, { eventId, code: token.qrCodeFor(t.publicId, t.qrVersion), clientId: "cz-test-scan-1" });
  const usage = await bridge.usageForCompany("bedrijf-1", seasonId);
  assert.equal(usage.issued, 4);
  assert.equal(usage.used, 1);
  const rep = await reports.eventReport(actor, eventId);
  assert.equal(rep.hhc.issued, 4);
  assert.equal(rep.hhc.admitted, 1);
  assert.equal(rep.hhc.notYetScanned, 3);
  assert.equal(rep.byType[0].name, "Sponsorkaart");
  await assert.rejects(reports.eventReport(limited, eventId), /bevoegdheid/);
});

test("exports: rechten, geen persoonsgegevens zonder recht, auditlog", { skip }, async () => {
  const noPersonal: TicketsActor = { id: "x", name: "X", access: { userId: "x", isSuperadmin: false, hasAccess: true, permissions: [], can: (p) => ["exports:export", "tickets:read", "reports:read", "scan:history"].includes(p) } };
  const file = await reports.buildExport(noPersonal, "tickets", "csv", eventId);
  const text = String(file.body);
  assert.ok(text.includes("Sponsorkaart"));
  assert.ok(!text.includes("Sponsor1"), "geen namen zonder tickets:personal");
  assert.ok(!text.includes("@bedrijf.nl"));
  const full = String(((await reports.buildExport(actor, "tickets", "csv", eventId)).body));
  assert.ok(full.includes("Sponsor1") && full.includes("s1@bedrijf.nl"));
  const x = await reports.buildExport(actor, "scans", "xlsx", eventId);
  assert.ok(x.body instanceof Uint8Array && x.body.length > 200);
  const pdf = await reports.buildExport(actor, "rapport", "pdf", eventId);
  assert.equal(Buffer.from(pdf.body as Uint8Array).subarray(0, 4).toString(), "%PDF");
  await assert.rejects(reports.buildExport(limited, "tickets", "csv", eventId), /bevoegdheid/);
  assert.ok((await db.ticketAuditEvent.count({ where: { action: "export.created" } })) >= 3);
});

test("ticket opnieuw opvragen: altijd hetzelfde antwoord, alleen naar het bekende adres, met limiet", { skip }, async () => {
  const resend = await import("../resend.server");
  await db.ticketDelivery.deleteMany();
  const before = 0;
  const unknown = await resend.requestTicketResend({ email: "onbekend@nergens.nl" }, "10.9.9.1");
  assert.equal(await db.ticketDelivery.count(), before, "geen pogingen voor een onbekend adres");
  const known = await resend.requestTicketResend({ email: "S2@bedrijf.nl" }, "10.9.9.2");
  assert.deepEqual(known, unknown);
  const rows = await db.ticketDelivery.findMany({ where: { byName: "Ticket opnieuw opgevraagd" } });
  assert.equal(rows.length, 1);
  const t = await db.ticket.findUniqueOrThrow({ where: { id: rows[0].ticketId } });
  assert.equal(t.email, "s2@bedrijf.nl");
  await resend.requestTicketResend({ email: "s2@bedrijf.nl" }, "10.9.9.3");
  await resend.requestTicketResend({ email: "s2@bedrijf.nl" }, "10.9.9.4");
  await assert.rejects(resend.requestTicketResend({ email: "s2@bedrijf.nl" }, "10.9.9.5"), /al een aanvraag/);
  await assert.rejects(resend.requestTicketResend({ email: "geen-adres" }, "10.9.9.6"));
});

test("sponsorbanner: om de beurt gekozen, klik geteld per ticket en alleen naar de opgeslagen link", { skip }, async () => {
  const b = await import("../banner.server");
  const a = await db.ticketBanner.create({ data: { companyId: "bedrijf-1", name: "A", title: "Aanbod A", targetUrl: "https://a.example/actie" } });
  const c = await db.ticketBanner.create({ data: { companyId: "bedrijf-2", name: "B", title: "Aanbod B", targetUrl: "https://b.example/actie" } });
  const t = await db.ticket.findFirstOrThrow({ where: { externalRef: "contract:1:quota:1" } });
  const first = (await b.pickBanner())!;
  await b.recordBannerSend(first.id, t.id);
  const second = (await b.pickBanner())!;
  assert.notEqual(first.id, second.id, "de volgende mail krijgt de andere banner");
  const link = token.linkTokenFor(t.publicId, t.linkVersion);
  assert.equal(await b.registerBannerClick(a.id, link), "https://a.example/actie");
  await b.registerBannerClick(a.id, link);
  await b.registerBannerClick(a.id, "onzin");
  assert.equal(await b.registerBannerClick("bestaat-niet", link), null);
  assert.equal(await db.ticketBannerClick.count({ where: { bannerId: a.id } }), 3);
  assert.equal(await db.ticketBannerClick.count({ where: { bannerId: a.id, ticketId: t.id } }), 2);
  await db.ticketBanner.delete({ where: { id: c.id } });
});

test("trends per seizoen: verkocht en binnen per duel", { skip }, async () => {
  const trends = await import("../trends.server");
  const r = await trends.seasonTrends(actor, seasonId);
  assert.equal(r.season?.id, seasonId);
  const g = r.games.find((x) => x.id === eventId)!;
  assert.ok(g.hhcSold >= 1);
  assert.ok(g.admitted >= 1);
  await assert.rejects(trends.seasonTrends(limited, seasonId), /bevoegdheid/);
});
