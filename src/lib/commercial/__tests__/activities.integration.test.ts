// Integratietest gearchiveerde contactmomenten terugvinden, herstellen en definitief wissen.
// Overgeslagen zonder TEST_DATABASE_URL (zie service.integration.test.ts).
import { before, after, test } from "node:test";
import assert from "node:assert/strict";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

let db: typeof import("@/lib/prisma").prisma;
let svc: typeof import("../service.server");
let authz: typeof import("../authz.server");
let ctxMod: typeof import("../ctx.server");
let co: typeof import("../companies.server");
let act: typeof import("../activities.server");

async function mkUser(key: string, roles: string[] = ["HUB"]) {
  const u = await db.user.create({ data: { name: key, email: `${key}@act.test`, passwordHash: "x", roles: roles as never } });
  return { id: u.id, name: key, email: u.email, roles };
}
async function rejects(p: Promise<unknown>, status: number) {
  await assert.rejects(p, (e: { status?: number }) => e.status === status);
}

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../service.server");
  authz = await import("../authz.server");
  ctxMod = await import("../ctx.server");
  co = await import("../companies.server");
  act = await import("../activities.server");
  await db.commercialIndexation.deleteMany();
  await db.commercialOpportunity.deleteMany();
  await db.commercialCounterpart.deleteMany();
  await db.commercialContract.deleteMany();
  await db.commercialFile.deleteMany();
  await db.commercialTask.deleteMany();
  await db.commercialActivity.deleteMany();
  await db.commercialContact.deleteMany();
  await db.commercialCompany.deleteMany();
  await db.commercialAuditEvent.deleteMany();
  await db.commercialMembership.deleteMany();
  await db.commercialRole.deleteMany();
  await db.user.deleteMany({ where: { email: { endsWith: "@act.test" } } });
});
after(async () => {
  if (!skip) await db.$disconnect();
});

test("bestaande Beheerder-rol krijgt 'definitief wissen' één keer", { skip }, async () => {
  // Rol zoals die in productie al bestond, van voor de nieuwe bevoegdheid.
  await db.commercialRole.create({ data: { key: "beheerder", name: "Beheerder Commerciële Zaken", permissions: ["history:read", "history:archive"], isSystem: true } });
  await authz.ensureSystemRoles();
  let r = await db.commercialRole.findUniqueOrThrow({ where: { key: "beheerder" } });
  assert.ok(r.permissions.includes("history:delete"));
  // Een beheerder haalt het bewust weg: het komt niet terug.
  await db.commercialRole.update({ where: { key: "beheerder" }, data: { permissions: ["history:read"] } });
  await authz.ensureSystemRoles();
  r = await db.commercialRole.findUniqueOrThrow({ where: { key: "beheerder" } });
  assert.ok(!r.permissions.includes("history:delete"));
  await db.commercialRole.update({ where: { key: "beheerder" }, data: { permissions: [...(await import("../permissions")).ALL_PERMISSIONS] } });
});

test("archief doorzoeken, herstellen en definitief wissen", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await mkUser("admin", ["ADMIN", "HUB"]);
  const mgr = await mkUser("mgr");
  const rel = await mkUser("rel");
  const own = await mkUser("own");
  const adm = await svc.buildActor(admin);
  await svc.grantMembership(adm, mgr.id, await role("beheerder"));
  await svc.grantMembership(adm, rel.id, await role("relatiebeheerder"));
  await svc.grantMembership(adm, own.id, await role("relatiebeheerder"));
  await svc.setMemberPermissions(adm, rel.id, [...(await db.commercialRole.findUniqueOrThrow({ where: { key: "relatiebeheerder" } })).permissions, "history:archive"]);
  await svc.setMemberPermissions(adm, own.id, [...(await db.commercialRole.findUniqueOrThrow({ where: { key: "relatiebeheerder" } })).permissions, "history:archive"]);
  await svc.setMemberScopes(adm, own.id, { companies: "OWN" });

  const cm = await ctxMod.buildRecordCtx(mgr);
  const cr = await ctxMod.buildRecordCtx(rel);
  const cown = await ctxMod.buildRecordCtx(own);
  const ca = await ctxMod.buildRecordCtx(admin);
  assert.ok(cm.can("history:delete") && ca.can("history:delete"));
  assert.ok(!cr.can("history:delete"), "relatiebeheerder mag niet wissen");

  const x = await co.createCompany(cm, { name: "Bakkerij Jansen" });
  const y = await co.createCompany(cm, { name: "Garage De Vries" });
  const a1 = await co.createActivity(cr, x.id, { kind: "CALL", occurredAt: new Date("2026-09-01T10:00:00Z"), summary: "Gesprek over het bordpakket" });
  const a2 = await co.createActivity(cr, x.id, { kind: "VISIT", occurredAt: new Date("2026-09-02T10:00:00Z"), summary: "Kantinebezoek", followUp: "Offerte sturen" });
  const a3 = await co.createActivity(cr, y.id, { kind: "EMAIL", occurredAt: new Date("2026-09-03T10:00:00Z"), summary: "Bordpakket gemaild" });
  const task = await db.commercialTask.create({ data: { title: "Bellen", createdById: rel.id, companyId: x.id, activityId: a1.id } });

  await co.archiveActivity(cr, a1.id);
  await co.archiveActivity(cr, a3.id);

  // Actief en gearchiveerd per dossier.
  assert.deepEqual((await act.findActivities(cr, { companyId: x.id, archived: false })).activities.map((a) => a.id), [a2.id]);
  assert.deepEqual((await act.findActivities(cr, { companyId: x.id, archived: true })).activities.map((a) => a.id), [a1.id]);
  // Over alle dossiers zoeken op tekst en op bedrijfsnaam.
  assert.deepEqual(new Set((await act.findActivities(cr, { archived: true, q: "bordpakket" })).activities.map((a) => a.id)), new Set([a1.id, a3.id]));
  assert.deepEqual((await act.findActivities(cr, { archived: true, q: "garage" })).activities.map((a) => a.companyName), ["Garage De Vries"]);
  assert.deepEqual((await act.findActivities(cr, { archived: false, q: "offerte" })).activities.map((a) => a.id), [a2.id]);
  // Bereik 'eigen' ziet de momenten van andermans dossiers niet.
  assert.equal((await act.findActivities(cown, { archived: true })).total, 0);
  await rejects(act.findActivities(cown, { companyId: x.id, archived: true }), 404);
  await rejects(act.restoreActivity(cown, a1.id), 404);

  // Herstellen.
  await act.restoreActivity(cr, a1.id);
  await rejects(act.restoreActivity(cr, a1.id), 409);
  assert.equal((await act.findActivities(cr, { companyId: x.id, archived: false })).total, 2);

  // Wissen: alleen met het eigen recht, actief én gearchiveerd.
  await rejects(act.deleteActivity(cr, a1.id), 403);
  await act.deleteActivity(cm, a1.id);
  await act.deleteActivity(ca, a3.id);
  assert.equal(await db.commercialActivity.count({ where: { id: { in: [a1.id, a3.id] } } }), 0);
  await rejects(act.deleteActivity(cm, a1.id), 404);
  // Gekoppelde taak blijft bestaan, zonder verwijzing.
  assert.equal((await db.commercialTask.findUniqueOrThrow({ where: { id: task.id } })).activityId, null);

  // Logboek: wel de handeling, niet de inhoud.
  const log = await db.commercialAuditEvent.findMany({ where: { action: "activity.delete" } });
  assert.equal(log.length, 2);
  for (const e of log) assert.ok(!JSON.stringify(e).toLowerCase().includes("bordpakket"));
  assert.equal(await db.commercialAuditEvent.count({ where: { action: "activity.restore", entityId: a1.id } }), 1);
  assert.equal(await db.commercialAuditEvent.count({ where: { action: "activity.archive" } }), 2);
});
