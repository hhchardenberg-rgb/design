// Integratietest tegen een echte Postgres. Wordt overgeslagen zonder TEST_DATABASE_URL.
// Controleert: concept raakt niets, publiceren is atomair, ontwerp vastgelegd bij uitgifte,
// opnieuw vormgeven behoudt QR/link/scans, seizoen kopiëren zonder tickets, rechten en conflicten.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { TicketsActor } from "../../authz.server";
import { ALL_TICKET_PERMISSIONS, type TicketPermission } from "../../permissions";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

let db: (typeof import("@/lib/prisma"))["prisma"];
let svc: typeof import("../../tickets.server");
let catalog: typeof import("../../catalog.server");
let admin2: typeof import("../admin.server");
let ctx: typeof import("../context.server");
let token: typeof import("../../token");

function actor(id: string, perms: readonly TicketPermission[] = ALL_TICKET_PERMISSIONS): TicketsActor {
  const set = new Set(perms);
  return { id, name: `Test ${id}`, access: { userId: id, isSuperadmin: false, hasAccess: true, permissions: [...perms], can: (p) => set.has(p) } };
}
const admin = actor("admin-a");
const colleague = actor("admin-b");
const editor = actor("editor", ["design:read", "design:edit", "tickets:read"]);
const viewer = actor("viewer", ["design:read"]);

let seasonId: string, season2: string, eventId: string, typeId: string;

async function wipe() {
  await db.ticketScan.deleteMany();
  await db.ticketEventLink.deleteMany();
  await db.ticket.deleteMany();
  await db.ticketBatch.deleteMany();
  await db.ticketType.deleteMany();
  await db.ticketEvent.deleteMany();
  await db.ticketZone.deleteMany();
  await db.ticketSeason.deleteMany();
  await db.ticketAuditEvent.deleteMany();
  await db.ticketDesignScopeVersion.deleteMany();
  await db.ticketDesignScope.deleteMany();
  await db.ticketDesignSnapshot.deleteMany();
  await db.ticketDesignSet.deleteMany();
}

const status = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (e) {
    return (e as { status?: number }).status ?? 500;
  }
};
const holder = (n: number) => ({ firstName: `Voor${n}`, lastName: `Achter${n}`, email: `d${n}@test.nl`, phone: "0612345678" });
const load = (id: string) => db.ticket.findUniqueOrThrow({ where: { id }, include: ctx.ticketInclude });
const issue = async (n: number) => ((await svc.issueTickets(admin, { typeId, eventIds: [eventId], holders: [holder(n)] })) as { ticketIds: string[] }).ticketIds[0];

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../../tickets.server");
  catalog = await import("../../catalog.server");
  admin2 = await import("../admin.server");
  ctx = await import("../context.server");
  token = await import("../../token");
  await wipe();
  const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString();
  seasonId = (await catalog.saveSeason(admin, null, { name: "Ontwerp 2099", startsOn: new Date().toISOString().slice(0, 10), endsOn: "2099-06-30" }))!.id;
  season2 = (await catalog.saveSeason(admin, null, { name: "Ontwerp 2100", startsOn: "2099-07-01", endsOn: "2100-06-30" }))!.id;
  eventId = (await catalog.saveEvent(admin, null, { title: "HHC – Ontwerp", startsAt: inAWeek, status: "ACTIVE", seasonId }))!.id;
  typeId = (await catalog.saveType(admin, null, { name: "Staanplaats", category: "FREE", validityMode: "SINGLE" }))!.id;
});

after(async () => {
  if (skip) return;
  await wipe();
  await db.$disconnect();
});

test("uitgifte legt het ontwerp vast; een concept verandert niets aan uitgegeven of nieuwe tickets", { skip }, async () => {
  const id = await issue(1);
  const t = await load(id);
  assert.ok(t.designSnapshotId, "ticket heeft een vastgelegd ontwerp");
  const before = (await ctx.ticketView(t, "mobile")).view.style;
  const r = await admin2.saveDraft(admin, { scopeKey: `season:${seasonId}`, overrides: { shared: { "color.primary": { m: "value", v: "#123456" }, "color.onPrimary": { m: "value", v: "#FFFFFF" } } }, revision: 0 });
  assert.equal(r.hasDraft, true);
  assert.deepEqual((await ctx.ticketView(await load(id), "mobile")).view.style, before);
  const fresh = await load(await issue(2));
  assert.equal(fresh.designSnapshotId, t.designSnapshotId, "nieuw ticket gebruikt nog het gepubliceerde ontwerp");
});

test("conflict: een verouderde revisie wordt geweigerd met de naam van de collega", { skip }, async () => {
  const row = await db.ticketDesignScope.findUniqueOrThrow({ where: { scopeKey: `season:${seasonId}` } });
  await assert.rejects(admin2.saveDraft(colleague, { scopeKey: `season:${seasonId}`, overrides: {}, revision: row.draftRevision - 1 }), (e: Error & { status: number }) => e.status === 409 && e.message.includes("Test admin-a"));
});

test("rechten worden op de server afgedwongen", { skip }, async () => {
  assert.equal(await status(admin2.saveDraft(viewer, { scopeKey: "club", overrides: {}, revision: 0 })), 403);
  assert.equal(await status(admin2.publish(editor, { scopeKeys: [`season:${seasonId}`] })), 403);
  assert.equal(await status(admin2.reapply(editor, { scopeKey: `season:${seasonId}` })), 403);
  assert.equal(await status(admin2.history(viewer, `season:${seasonId}`)), 200);
});

test("onjuiste invoer wordt op de server opgeschoond of geweigerd", { skip }, async () => {
  assert.equal(await status(admin2.saveDraft(admin, { scopeKey: "season:bestaatniet", overrides: {}, revision: 0 })), 404);
  assert.equal(await status(admin2.saveDraft(admin, { scopeKey: "club", overrides: { shared: { "qr.a4Size": { m: "value", v: 999 } } }, revision: 0 })), 400);
});

test("publiceren met een fout publiceert niets (alles of niets)", { skip }, async () => {
  const key = `event:${eventId}`;
  // Een afwijking voor een onderdeel dat in beide formaten verborgen is: moet eerst worden opgelost.
  const blocks = (await admin2.fieldDefaults())["layout.blocks"];
  const hide = (list: unknown) => (list as { id: string; visible: boolean }[]).map((b) => (b.id === "sponsors" ? { ...b, visible: false } : b));
  await admin2.saveDraft(admin, { scopeKey: key, overrides: { mobile: { "layout.blocks": { m: "value", v: hide(blocks.mobile) } }, a4: { "layout.blocks": { m: "value", v: hide(blocks.a4) } }, shared: { "sponsors.title": { m: "value", v: "Partners" } } }, revision: 0 });
  const before = await db.ticketDesignScope.findUniqueOrThrow({ where: { scopeKey: `season:${seasonId}` } });
  assert.equal(await status(admin2.publish(admin, { scopeKeys: [`season:${seasonId}`, key] })), 400);
  const afterRow = await db.ticketDesignScope.findUniqueOrThrow({ where: { scopeKey: `season:${seasonId}` } });
  assert.equal(afterRow.publishedVersion, before.publishedVersion, "seizoen is niet half gepubliceerd");
  await admin2.discardDraft(admin, key);
});

test("publiceren: nieuwe versie, nieuwe uitgifte krijgt het nieuwe ontwerp, oude tickets niet", { skip }, async () => {
  const old = await db.ticket.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  const r = await admin2.publish(admin, { scopeKeys: [`season:${seasonId}`], note: "test" });
  assert.equal(r.versions[`season:${seasonId}`], 1);
  const row = await db.ticketDesignScope.findUniqueOrThrow({ where: { scopeKey: `season:${seasonId}` } });
  assert.equal(row.draft, null);
  assert.equal(await db.ticketDesignScopeVersion.count({ where: { scopeKey: `season:${seasonId}` } }), 1);
  assert.equal(await db.ticketAuditEvent.count({ where: { action: "design.published" } }), 1);
  const fresh = await load(await issue(3));
  assert.notEqual(fresh.designSnapshotId, old.designSnapshotId);
  assert.equal((await ctx.ticketView(fresh, "a4")).view.style.primary, "#123456");
  const oldView = (await ctx.ticketView(await load(old.id), "a4")).view.style.primary;
  assert.notEqual(oldView, "#123456");
});

test("opnieuw vormgeven: alleen het ontwerp verandert; QR, link, status en scans blijven", { skip }, async () => {
  const old = await db.ticket.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  await db.ticketScan.create({ data: { clientId: "scan-ontwerp-1", scannedAt: new Date(), eventId, source: "HHC", ticketId: old.id, result: "VALID" } });
  const qrBefore = token.qrCodeFor(old.publicId, old.qrVersion);
  const dry = await admin2.reapply(admin, { scopeKey: `season:${seasonId}`, dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.ok(dry.changed >= 1);
  assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: old.id } })).designSnapshotId, old.designSnapshotId, "proefrun verandert niets");
  const done = await admin2.reapply(admin, { scopeKey: `season:${seasonId}`, dryRun: false });
  assert.equal(done.changed, dry.changed);
  const after = await db.ticket.findUniqueOrThrow({ where: { id: old.id } });
  assert.notEqual(after.designSnapshotId, old.designSnapshotId);
  assert.equal(after.publicId, old.publicId);
  assert.equal(after.qrVersion, old.qrVersion);
  assert.equal(after.linkVersion, old.linkVersion);
  assert.equal(after.status, old.status);
  assert.equal(token.qrCodeFor(after.publicId, after.qrVersion), qrBefore);
  assert.equal(await db.ticketScan.count({ where: { ticketId: old.id } }), 1);
  assert.ok((await db.ticketAuditEvent.count({ where: { ticketId: old.id, action: "ticket.redesigned" } })) === 1);
});

test("nieuw seizoen op basis van vorig: zelfstandige kopie als concept, zonder tickets", { skip }, async () => {
  const tickets = await db.ticket.count();
  const r = await admin2.copyScopes(admin, { from: `season:${seasonId}`, to: `season:${season2}` });
  assert.equal(r.copied, 1);
  const target = await db.ticketDesignScope.findUniqueOrThrow({ where: { scopeKey: `season:${season2}` } });
  assert.equal(target.publishedVersion, 0, "nog niet gepubliceerd");
  assert.ok(target.draft);
  assert.equal(await db.ticket.count(), tickets);
  // Zelfstandig: de bron wijzigen verandert het doel niet.
  await admin2.saveDraft(admin, { scopeKey: `season:${seasonId}`, overrides: {}, revision: (await db.ticketDesignScope.findUniqueOrThrow({ where: { scopeKey: `season:${seasonId}` } })).draftRevision });
  await admin2.publish(admin, { scopeKeys: [`season:${seasonId}`] });
  const again = await db.ticketDesignScope.findUniqueOrThrow({ where: { scopeKey: `season:${season2}` } });
  assert.deepEqual(again.draft, target.draft);
  // Overschrijven vraagt bevestiging.
  assert.equal(await status(admin2.copyScopes(admin, { from: `season:${seasonId}`, to: `season:${season2}` })), 409);
});

test("herstellen: een eerdere versie komt terug als concept", { skip }, async () => {
  await admin2.restoreVersion(admin, { scopeKey: `season:${seasonId}`, version: 1 });
  const row = await db.ticketDesignScope.findUniqueOrThrow({ where: { scopeKey: `season:${seasonId}` } });
  assert.equal(row.publishedVersion, 2, "gepubliceerd blijft ongewijzigd tot opnieuw publiceren");
  assert.deepEqual((row.draft as { shared: Record<string, unknown> }).shared["color.primary"], { m: "value", v: "#123456" });
});

test("seizoenskaart toont geen wedstrijdgegevens en volgt geen duelinstellingen", { skip }, async () => {
  const sc = (await catalog.saveType(admin, null, { name: "Seizoenskaart", category: "SEASON", validityMode: "SEASON", seasonId }))!.id;
  const r = (await svc.issueTickets(admin, { typeId: sc, holders: [holder(9)] })) as { ticketIds: string[] };
  const t = await load(r.ticketIds[0]);
  const { view } = await ctx.ticketView(t, "mobile");
  assert.ok(!view.blocks.some((b) => b.id === "match" && "kickoff" in b && b.kickoff));
  const c = ctx.contextOfTicket({ ...t, typeId: t.typeId, seasonId: t.seasonId, isSeasonCard: t.isSeasonCard, validityMode: t.validityMode, category: t.category, links: t.links });
  assert.equal(c.kind, "season");
  assert.equal(c.eventId, null);
});
