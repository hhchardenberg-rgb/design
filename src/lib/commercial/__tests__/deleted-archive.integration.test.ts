// Integratietest gesloten archief: dossier verwijderen (met bevestiging), overal verborgen,
// alleen zichtbaar voor beheerders, terugzetten. Overgeslagen zonder TEST_DATABASE_URL.
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
let tk: typeof import("../tasks.server");
let ct: typeof import("../contracts.server");
let ac: typeof import("../activities.server");
let arch: typeof import("../deleted-archive.server");

async function mkUser(key: string, roles: string[] = ["HUB"]) {
  const u = await db.user.create({ data: { name: key, email: `${key}@del.test`, passwordHash: "x", roles: roles as never } });
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
  tk = await import("../tasks.server");
  ct = await import("../contracts.server");
  ac = await import("../activities.server");
  arch = await import("../deleted-archive.server");
  await db.commercialIndexation.deleteMany();
  await db.commercialOpportunity.deleteMany();
  await db.commercialCounterpart.deleteMany();
  await db.commercialContract.deleteMany();
  await db.commercialSeason.deleteMany();
  await db.commercialFile.deleteMany();
  await db.commercialTask.deleteMany();
  await db.commercialActivity.deleteMany();
  await db.commercialContact.deleteMany();
  await db.commercialCompany.deleteMany();
  await db.commercialAuditEvent.deleteMany();
  await db.commercialMembership.deleteMany();
  await db.commercialRole.deleteMany();
  await db.user.deleteMany({ where: { email: { endsWith: "@del.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (!skip) await db.$disconnect();
});

test("verwijderen naar gesloten archief en terugzetten", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await mkUser("admin", ["ADMIN", "HUB"]);
  const mgr = await mkUser("mgr");
  const rel = await mkUser("rel");
  const adm = await svc.buildActor(admin);
  await svc.grantMembership(adm, mgr.id, await role("beheerder"));
  await svc.grantMembership(adm, rel.id, await role("relatiebeheerder"));
  // De standaardrol Beheerder krijgt het archief er automatisch bij.
  const beheerder = await db.commercialRole.findUniqueOrThrow({ where: { key: "beheerder" } });
  assert.ok(beheerder.permissions.includes("deleted_archive:read"));
  assert.ok(beheerder.permissions.includes("deleted_archive:update"));

  const ca = await ctxMod.buildRecordCtx(admin);
  const cm = await ctxMod.buildRecordCtx(mgr);
  const cr = await ctxMod.buildRecordCtx(rel);

  const x = await co.createCompany(cm, { name: "Slagerij Bos" });
  const keep = await co.createCompany(cm, { name: "Bakkerij Blijft" });
  await co.createContact(cm, x.id, { name: "Jan Bos" });
  await co.createActivity(cm, x.id, { kind: "CALL", occurredAt: new Date("2026-10-01T10:00:00Z"), summary: "Gebeld over bord" });
  const task = await tk.createTask(cm, { title: "Terugbellen", companyId: x.id });
  const s1 = await ct.saveSeason(cm, null, { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30", status: "ACTIVE" });
  await ct.createContract(cm, x.id, { seasonId: s1, startsOn: "2026-07-01", endsOn: "2027-06-30", amountCents: 100_000 });

  // Alleen beheerders verwijderen: ook met archiveerrecht (via uitzondering) mag een relatiebeheerder het niet.
  await rejects(arch.deleteCompany(cr, x.id, { confirm: true }), 403);
  await rejects(arch.deletePreview(cr, x.id), 403);
  const crArchive = { ...cr, can: (p: string) => p === "companies:archive" || cr.can(p as never) } as typeof cr;
  await rejects(arch.deleteCompany(crArchive, x.id, { confirm: true }), 403);
  assert.equal(arch.canDeleteCompanies(crArchive), false);
  assert.equal(arch.canDeleteCompanies(cm), true);
  await rejects(arch.listDeletedCompanies(cr, {}), 403);
  // Zonder bevestiging niets.
  await rejects(arch.deleteCompany(ca, x.id, { confirm: false }), 400);

  const preview = await arch.deletePreview(ca, x.id);
  assert.equal(preview.counts.contacts, 1);
  assert.equal(preview.counts.activities, 1);
  assert.equal(preview.counts.contracts, 1);

  await arch.deleteCompany(ca, x.id, { confirm: true, reason: "Dubbel aangemaakt" });

  // Overal weg, ook voor de hoofdadmin in de gewone schermen.
  assert.deepEqual((await co.listCompanies(ca, {})).rows.map((r) => r.name), ["Bakkerij Blijft"]);
  assert.equal((await co.listCompanies(ca, { archived: true })).rows.length, 0);
  await rejects(co.getCompany(ca, x.id), 404);
  await rejects(co.createContact(ca, x.id, { name: "Nieuw" }), 404);
  assert.equal((await tk.listTasks(ca, {})).rows.some((t) => t.id === task.id), false);
  await rejects(tk.updateTask(ca, task.id, { title: "x", version: 1 } as never), 404);
  assert.equal((await ct.listContracts(ca, {})).total, 0);
  assert.equal((await ac.findActivities(ca, { archived: false })).total, 0);
  assert.equal((await co.findDuplicates(ca, { name: "Slagerij Bos" })).visible.length, 0);
  await rejects(arch.deleteCompany(ca, x.id, { confirm: true }), 404); // al verwijderd

  // Niets gewist.
  assert.equal(await db.commercialContact.count({ where: { companyId: x.id } }), 1);
  assert.equal(await db.commercialActivity.count({ where: { companyId: x.id } }), 1);

  // Archief: beheerder ziet het, met reden en wie.
  const list = await arch.listDeletedCompanies(cm, {});
  assert.deepEqual(list.rows.map((r) => r.name), ["Slagerij Bos"]);
  assert.equal(list.rows[0].deleteReason, "Dubbel aangemaakt");
  assert.equal(list.rows[0].deletedByLabel, "admin");
  const detail = await arch.getDeletedCompany(cm, x.id);
  assert.equal(detail.contacts[0].name, "Jan Bos");
  assert.equal(detail.activities[0].summary, "Gebeld over bord");
  await rejects(arch.getDeletedCompany(cm, keep.id), 404); // niet verwijderd: niet via het archief
  await rejects(arch.getDeletedCompany(cr, x.id), 403);

  // Logboek.
  const events = await db.commercialAuditEvent.findMany({ where: { entityId: x.id, action: { in: ["company.delete", "company.undelete"] } } });
  assert.equal(events.length, 1);
  assert.equal(await db.auditEvent.count({ where: { action: "commercial.company_deleted", targetId: x.id } }), 1);

  // Terugzetten.
  await rejects(arch.restoreDeletedCompany(cr, x.id), 403);
  await arch.restoreDeletedCompany(cm, x.id);
  assert.equal((await co.getCompany(ca, x.id)).name, "Slagerij Bos");
  assert.equal((await ct.listContracts(ca, {})).total, 1);
  assert.ok((await tk.listTasks(ca, {})).rows.some((t) => t.id === task.id));
  assert.equal((await arch.listDeletedCompanies(cm, {})).rows.length, 0);
  assert.equal(await db.auditEvent.count({ where: { action: "commercial.company_restored", targetId: x.id } }), 1);
});
