// Restpunten uit de eindtest (17/11/2026): actiecodes met vier ogen, capaciteitswaarschuwing, scanner
// (andermans scan terugdraaien, onbekende code, testcode), /ticket-kwijt op de achtergrond, klikteller,
// afgelasten in delen en zoeken zonder accenten. Overgeslagen zonder TEST_DATABASE_URL; nooit echte mail.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { TicketsActor } from "../authz.server";
import type { ScanActor } from "../scanner-auth.server";
import { ALL_TICKET_PERMISSIONS, type TicketPermission } from "../permissions";
import { foldText } from "../like";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;
delete process.env.RESEND_API_KEY;
delete process.env.FULLHOUSE_MODE;
process.env.TICKETS_ENABLED = "true";

let db: typeof import("@/lib/prisma")["prisma"];
let svc: typeof import("../tickets.server");
let catalog: typeof import("../catalog.server");
let scan: typeof import("../scan.server");
let promo: typeof import("../promo.server");
let token: typeof import("../token");

function actor(id: string, perms: readonly TicketPermission[] = ALL_TICKET_PERMISSIONS): TicketsActor {
  const set = new Set(perms);
  return { id, name: `Test ${id}`, access: { userId: id, isSuperadmin: false, hasAccess: true, permissions: [...perms], can: (p) => set.has(p) } };
}
const admin = actor("rest-a");
const admin2 = actor("rest-b");
const steward = (over: Partial<ScanActor> = {}): ScanActor => ({ kind: "scanner", name: "Steward", scannerId: null, userId: null, entranceId: null, canOverride: false, canSeeStats: false, ...over });
const supervisor = steward({ name: "Supervisor", canOverride: true, userId: "sup-1" });

const DAY = 86_400_000;
let typeSingle: string, evMain: string, evCap: string;
let n = 0;
const cid = () => `rest-client-${Date.now()}-${n++}`;
const holder = (i: number, extra: Record<string, unknown> = {}) => ({ firstName: `Voor${i}`, lastName: `Achter${i}`, email: `rest${i}@test.nl`, ...extra });

async function wipe() {
  await db.ticketBannerClick.deleteMany();
  await db.ticketBannerSend.deleteMany();
  await db.ticketBanner.deleteMany();
  await db.ticketPromoClaim.deleteMany();
  await db.ticketPromo.deleteMany();
  await db.ticketScan.deleteMany();
  await db.ticketExternalTicket.deleteMany();
  await db.ticketDelivery.deleteMany();
  await db.ticketEventLink.deleteMany();
  await db.ticket.deleteMany();
  await db.ticketType.deleteMany();
  await db.ticketEvent.deleteMany();
  await db.ticketAuditEvent.deleteMany();
  await db.ticketPublicHit.deleteMany();
  await db.ticketSettings.deleteMany();
}

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../tickets.server");
  catalog = await import("../catalog.server");
  scan = await import("../scan.server");
  promo = await import("../promo.server");
  token = await import("../token");
  await wipe();
  const soon = Date.now() + 2 * DAY;
  evMain = (await catalog.saveEvent(admin, null, { title: "REST – Hoofd", startsAt: new Date(soon).toISOString(), status: "ACTIVE" }))!.id;
  evCap = (await catalog.saveEvent(admin, null, { title: "REST – Capaciteit", startsAt: new Date(soon + DAY).toISOString(), status: "ACTIVE", capacity: 2 }))!.id;
  typeSingle = (await catalog.saveType(admin, null, { name: "REST Vrijkaart", category: "FREE", validityMode: "SINGLE" }))!.id;
});

after(async () => {
  if (skip) return;
  await wipe();
  await db.$disconnect();
});

async function issue(eventIds: string[], holders: unknown[] = [holder(n++)]) {
  return (await svc.issueTickets(admin, { typeId: typeSingle, eventIds, holders })) as { ticketIds: string[]; capacityWarnings: string[] };
}

// ── 1. Actiecodes ─────────────────────────────────────────────────────────

test("actiecode aanmaken vereist ook tickets:issue", { skip }, async () => {
  const noIssue = actor("noissue", ["tickets:bulk"]);
  await assert.rejects(() => promo.savePromo(noIssue, { name: "X", typeId: typeSingle, eventIds: [evMain], maxClaims: 5 }), /bevoegdheid/);
});

test("actiecode boven de goedkeuringsdrempel: inactief tot een ander persoon met bulk:approve hem aanzet", { skip }, async () => {
  // Drempel 50 (standaard): 30 inwisselingen x 2 tickets = 60.
  const big = await promo.savePromo(admin, { name: "REST Groot", typeId: typeSingle, eventIds: [evMain], maxClaims: 30, ticketsPerClaim: 2 });
  assert.equal(big.pendingApproval, true);
  assert.equal((await db.ticketPromo.findUniqueOrThrow({ where: { id: big.id } })).active, false);
  await assert.rejects(() => promo.claimPromo({ code: big.code, firstName: "A", lastName: "B", email: "groot@test.nl" }, "10.9.0.1"), /niet \(meer\) actief/);
  // Zelf aanzetten kan niet, ook niet met alle rechten; iemand zonder bulk:approve ook niet.
  await assert.rejects(() => promo.setPromoActive(admin, big.id, true), /iemand anders/);
  await assert.rejects(() => promo.setPromoActive(actor("zonder", ["tickets:bulk", "tickets:issue"]), big.id, true), /bevoegdheid/);
  assert.deepEqual(await promo.setPromoActive(admin2, big.id, true), { ok: true });
  assert.equal((await promo.claimPromo({ code: big.code, firstName: "A", lastName: "B", email: "groot@test.nl" }, "10.9.0.2")).count, 2);
  assert.equal(await db.ticketAuditEvent.count({ where: { action: "promo.saved", summary: { contains: "goedgekeurd" } } }), 1);
  // Daarna is uit- en weer aanzetten gewoon mogelijk voor de maker.
  await promo.setPromoActive(admin, big.id, false);
  assert.deepEqual(await promo.setPromoActive(admin, big.id, true), { ok: true });
  // Onder de drempel blijft alles zoals het was.
  const small = await promo.savePromo(admin, { name: "REST Klein", typeId: typeSingle, eventIds: [evMain], maxClaims: 25, ticketsPerClaim: 2 });
  assert.equal(small.pendingApproval, false);
  assert.equal((await db.ticketPromo.findUniqueOrThrow({ where: { id: small.id } })).active, true);
});

// ── 2. Capaciteit ─────────────────────────────────────────────────────────

test("capaciteit: waarschuwing bij overschrijding, niet blokkerend", { skip }, async () => {
  const one = await issue([evCap]);
  assert.deepEqual(one.capacityWarnings, []);
  const over = await issue([evCap], [holder(n++), holder(n++)]);
  assert.equal(over.ticketIds.length, 2, "niet geblokkeerd");
  assert.equal(over.capacityWarnings.length, 1);
  assert.match(over.capacityWarnings[0], /3 geldige tickets.*capaciteit van 2/);
  assert.deepEqual((await issue([evMain])).capacityWarnings, [], "zonder capaciteit geen waarschuwing");
});

// ── 4. Scanner: andermans scan terugdraaien ───────────────────────────────

test("supervisor ziet scans van andere toestellen en draait ze terug; een steward niet", { skip }, async () => {
  const t = await db.ticket.findUniqueOrThrow({ where: { id: (await issue([evMain])).ticketIds[0] } });
  const a = steward({ scannerId: null, userId: "sc-a" });
  const r = await scan.processScan(a, { eventId: evMain, code: token.qrCodeFor(t.publicId, t.qrVersion), clientId: cid() });
  assert.equal(r.result, "VALID");
  await assert.rejects(() => scan.recentScansForSupervisor(a, [evMain]), /supervisor/);
  const list = await scan.recentScansForSupervisor(supervisor, [evMain]);
  assert.equal(list.scans.length, 1);
  assert.equal(list.scans[0].mine, false);
  assert.equal(list.scans[0].scanId, r.scanId);
  await assert.rejects(() => scan.voidScan(steward({ userId: "ander" }), { scanId: r.scanId, reason: "toch niet" }), /eigen scan/);
  await scan.voidScan(supervisor, { scanId: r.scanId, reason: "Ging toch niet naar binnen" });
  assert.equal((await scan.recentScansForSupervisor(supervisor, [evMain])).scans.length, 0);
  assert.equal((await scan.processScan(a, { eventId: evMain, code: token.qrCodeFor(t.publicId, t.qrVersion), clientId: cid() })).result, "VALID", "ticket telt weer als ongebruikt");
});

// ── 5. Scanner: onbekende code, (INVALID), testcode ───────────────────────

test("onzin bij een duel zonder Fullhouse-koppeling is 'bestaat niet', een bekende Fullhouse-kaart 'andere wedstrijd'", { skip }, async () => {
  const junk = await scan.processScan(supervisor, { eventId: evMain, code: "onzin-123456", clientId: cid() });
  assert.equal(junk.result, "INVALID");
  assert.equal(junk.reason, "NOT_FOUND");
  const hash = scan.codeHash("FH-ELDERS-1");
  await db.ticketExternalTicket.create({ data: { eventExtId: "rest-elders", externalId: "rest-x1", codeHash: hash, status: "VALID", ticketName: "Elders" } });
  const other = await scan.processScan(supervisor, { eventId: evMain, code: "FH-ELDERS-1", clientId: cid() });
  assert.equal(other.reason, "WRONG_EVENT");
});

test("geen ruwe Engelse status ('(INVALID)') in het scherm bij een afgekeurde Fullhouse-kaart", { skip }, async () => {
  const fh = (await catalog.saveEvent(admin, null, { title: "REST – Fullhouse", startsAt: new Date(Date.now() + DAY).toISOString(), status: "ACTIVE" }))!.id;
  await db.ticketEvent.update({ where: { id: fh }, data: { externalId: "rest-fh-1", source: "FULLHOUSE" } });
  for (const [code, status] of [["FH-REST-INV", "INVALID"], ["FH-REST-BLK", "BLOCKED"]] as const) {
    await db.ticketExternalTicket.create({ data: { eventExtId: "rest-fh-1", externalId: code, codeHash: scan.codeHash(code), status, ticketName: "Vak", holderLabel: "J. Jansen" } });
    const r = await scan.processScan(supervisor, { eventId: fh, code, clientId: cid() });
    assert.equal(r.result, "INVALID");
    assert.ok(!/INVALID|BLOCKED/.test(`${r.label} ${r.reasonLabel}`), `${r.label} / ${r.reasonLabel}`);
    assert.match(r.reasonLabel!, /geannuleerd|geblokkeerd/);
  }
});

test("testcode met een onbestaande wedstrijd: geen groen en geen auditregel", { skip }, async () => {
  const before = await db.ticketAuditEvent.count({ where: { action: "scan.test" } });
  await assert.rejects(() => scan.processScan(supervisor, { eventId: "bestaat-niet", code: "FH-TEST-0001", clientId: cid() }), /Wedstrijd niet gevonden/);
  assert.equal(await db.ticketAuditEvent.count({ where: { action: "scan.test" } }), before);
  assert.equal((await scan.processScan(supervisor, { eventId: evMain, code: "FH-TEST-0001", clientId: cid() })).result, "VALID");
  assert.equal(await db.ticketAuditEvent.count({ where: { action: "scan.test" } }), before + 1);
});

// ── 6. /ticket-kwijt en klikteller ────────────────────────────────────────

test("/ticket-kwijt: het mailen gebeurt na het antwoord, zodat de responstijd niets verraadt", { skip }, async () => {
  const { requestTicketResend } = await import("../resend.server");
  const kwijt = (await issue([evMain], [holder(77_001, { email: "kwijt@test.nl" })])).ticketIds[0];
  const queue: (() => Promise<void>)[] = [];
  const known = await requestTicketResend({ email: "kwijt@test.nl" }, "10.7.0.1", (task) => void queue.push(task));
  const unknown = await requestTicketResend({ email: "onbekend@test.nl" }, "10.7.0.2", (task) => void queue.push(task));
  assert.deepEqual(known, unknown, "zelfde antwoord");
  assert.equal(await db.ticketDelivery.count({ where: { ticketId: kwijt } }), 0, "nog niets verstuurd bij het antwoord");
  for (const task of queue) await task();
  assert.equal(await db.ticketDelivery.count({ where: { ticketId: kwijt } }), 1, "daarna wel een poging (zonder maildienst: mislukt, maar gelogd)");
});

test("klikteller: ingetrokken link wordt niet aan het ticket toegerekend en per IP is er een limiet", { skip }, async () => {
  const b = await import("../banner.server");
  const bn = await db.ticketBanner.create({ data: { companyId: "rest-bedrijf", name: "R", title: "R", targetUrl: "https://r.example/x" } });
  const t = await db.ticket.findUniqueOrThrow({ where: { id: (await issue([evMain])).ticketIds[0] } });
  const oldLink = token.linkTokenFor(t.publicId, t.linkVersion);
  await svc.reissue(admin, t.id, { what: "link", reason: "test intrekken" });
  assert.equal(await b.registerBannerClick(bn.id, oldLink), "https://r.example/x", "klik werkt nog, ook na intrekken");
  assert.equal(await db.ticketBannerClick.count({ where: { bannerId: bn.id } }), 1);
  assert.equal(await db.ticketBannerClick.count({ where: { bannerId: bn.id, ticketId: t.id } }), 0, "niet aan het ticket toegerekend");
  const fresh = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
  await b.registerBannerClick(bn.id, token.linkTokenFor(fresh.publicId, fresh.linkVersion));
  assert.equal(await db.ticketBannerClick.count({ where: { bannerId: bn.id, ticketId: t.id } }), 1, "huidige link telt wel");
  // Limiet: na het maximum geen extra tellingen, wel nog doorsturen.
  for (let i = 0; i < b.BANNER_CLICKS_PER_IP + 3; i++) assert.equal(await b.registerBannerClick(bn.id, null, "10.8.0.1"), "https://r.example/x");
  assert.equal(await db.ticketBannerClick.count({ where: { bannerId: bn.id } }), 2 + b.BANNER_CLICKS_PER_IP);
  await b.registerBannerClick(bn.id, null, "10.8.0.2");
  assert.equal(await db.ticketBannerClick.count({ where: { bannerId: bn.id } }), 3 + b.BANNER_CLICKS_PER_IP, "ander IP telt apart");
});

// ── 7. Afgelasten in delen ────────────────────────────────────────────────

test("afgelasten stopt netjes binnen de tijd, meldt wat openstaat en opnieuw uitvoeren doet de rest", { skip }, async () => {
  const ec = await import("../eventchange.server");
  const ev = (await catalog.saveEvent(admin, null, { title: "REST – Afgelast in delen", startsAt: new Date(Date.now() + 3 * DAY).toISOString() }))!.id;
  await issue([ev], [holder(1), holder(2), holder(3)]);
  const first = await ec.changeEvent(admin, ev, { action: "CANCEL", sendMail: true }, { budgetMs: -1, pauseMs: 0 });
  assert.ok(!first.dryRun);
  if (first.dryRun) return;
  assert.equal(first.recipients, 3);
  assert.equal(first.sent + first.failed, 0);
  assert.equal(first.remaining, 3);
  assert.equal((await db.ticketEvent.findUniqueOrThrow({ where: { id: ev } })).status, "CANCELLED");
  // Opnieuw: alleen wat openstaat (zonder maildienst mislukt de verzending, maar elk adres is aan de beurt geweest).
  const second = await ec.changeEvent(admin, ev, { action: "CANCEL", sendMail: true }, { pauseMs: 0 });
  assert.ok(!second.dryRun);
  if (second.dryRun) return;
  assert.equal(second.remaining, 0);
  assert.equal(second.sent + second.failed, 3);
  assert.equal(await db.ticketAuditEvent.count({ where: { eventId: ev, action: "event.cancelled" } }), 1, "afgelasten zelf maar één keer gelogd");
  // Zonder mails om te hervatten blijft 'al afgelast' een fout.
  await assert.rejects(() => ec.changeEvent(admin, ev, { action: "CANCEL", sendMail: false }), /al afgelast/);
});

// ── 8. Zoeken zonder accenten ─────────────────────────────────────────────

test("foldText: hoofdletters en accenten weg, één teken blijft één teken", () => {
  assert.equal(foldText("Müller"), "muller");
  assert.equal(foldText("MÜLLER"), "muller");
  assert.equal(foldText("Zoë Łukasz Øvergaard"), "zoe lukasz overgaard");
});

test("zoektool: 'Muller' vindt 'Müller' en andersom, ook zonder hoofdletters en met accenten in bedrijfsnaam", { skip }, async () => {
  const search = await import("../support-search.server");
  await svc.issueTickets(admin, { typeId: typeSingle, eventIds: [evMain], holders: [{ firstName: "Jörg", lastName: "Müller", email: "jm@test.nl", company: "Café Zoë" }, { firstName: "Piet", lastName: "Muller", email: "pm@test.nl" }] });
  const find = (q: string) => search.supportSearch(admin, { q, kind: "name" }, { skipLimit: true });
  const names = (r: Awaited<ReturnType<typeof find>>) => r.hhc.customers.map((c) => c.name ?? "").sort();
  assert.deepEqual(names(await find("Muller")), ["Jörg Müller", "Piet Muller"]);
  assert.deepEqual(names(await find("müller")), ["Jörg Müller", "Piet Muller"]);
  assert.deepEqual(names(await find("MULLER jorg")), ["Jörg Müller"]);
  assert.deepEqual(names(await find("cafe zoe")), ["Jörg Müller"]);
  assert.equal((await find("%%%")).hhc.count, 0, "jokertekens blijven letterlijk");
});
