// Integratietest tegen een echte Postgres. Wordt overgeslagen zonder TEST_DATABASE_URL.
// Controleert dat het overzetten naar één rollensysteem niemand rechten laat verliezen,
// dat wijzigingen buiten het systeem om worden opgepikt en dat het beheer zijn grenzen houdt.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;
process.env.COMMERCIAL_ENABLED = "true";

type Access = typeof import("../service.server");
type Authz = typeof import("@/lib/commercial/authz.server");
type Managers = typeof import("@/lib/user-managers.server");
type Db = typeof import("@/lib/prisma");

let access: Access, authz: Authz, managers: Managers, db: Db["prisma"];
const MAIL = "@access.test";

async function mkUser(key: string, data: { role?: "USER" | "ADMIN"; roles?: string[] } = {}) {
  return db.user.create({ data: { name: key, email: `${key}${MAIL}`, passwordHash: "x", role: data.role ?? "USER", roles: (data.roles ?? []) as never } });
}
async function rejects(p: Promise<unknown>, status: number) {
  await assert.rejects(p, (e: { status?: number }) => e.status === status);
}
const roleNames = async (userId: string) =>
  (await db.userAccessRole.findMany({ where: { userId }, include: { role: true } })).map((r) => r.role.name).sort();
const actorOf = async (userId: string) => {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return (await managers.managerFor({ id: u.id, name: u.name, email: u.email, roles: u.roles }))!.actor;
};

before(async () => {
  if (skip) return;
  access = await import("../service.server");
  authz = await import("@/lib/commercial/authz.server");
  managers = await import("@/lib/user-managers.server");
  db = (await import("@/lib/prisma")).prisma;
  await db.userAccessRole.deleteMany();
  await db.accessRole.deleteMany();
  await db.commercialAuditEvent.deleteMany();
  await db.commercialMembership.deleteMany();
  await db.commercialRole.deleteMany();
  await db.user.deleteMany();
});

after(async () => {
  if (!skip) await db.$disconnect();
});

test("overzetten: iedereen houdt precies dezelfde toegang", { skip }, async () => {
  // Uitgangssituatie zoals in productie: oude rolvelden en CZ-lidmaatschappen met CZ-rollen.
  const legacyAdmin = await mkUser("oudeadmin", { role: "ADMIN" }); // nog nooit omgezet: roles leeg
  const both = await mkUser("beide", { roles: ["HUB", "TICKETING_ADMIN"] });
  const nobody = await mkUser("niemand", { roles: ["USER"] });
  const czWithRole = await mkUser("czrol", { roles: ["HUB"] });
  const czNoRole = await mkUser("czzonder", { roles: ["TICKETING"] });
  const czOnly = await mkUser("czalleen", { roles: ["USER"] });
  const cr = await db.commercialRole.create({ data: { key: "relatiebeheerder", name: "Relatiebeheerder", permissions: ["companies:read", "companies:update", "contacts:read"] } });
  const other = await db.commercialRole.create({ data: { key: "alleen-lezen", name: "Alleen lezen", permissions: ["companies:read"] } });
  await db.commercialMembership.create({ data: { userId: czWithRole.id, roleId: cr.id, overrides: { create: [{ permission: "contacts:read", effect: "DENY" }] } } });
  await db.commercialMembership.create({ data: { userId: czNoRole.id, roleId: null, overrides: { create: [{ permission: "companies:read", effect: "ALLOW" }] } } });
  await db.commercialMembership.create({ data: { userId: czOnly.id, roleId: other.id } });

  const before = new Map<string, string[]>();
  for (const u of [czWithRole, czNoRole, czOnly]) before.set(u.id, [...(await authz.loadCommercialAccess(u.id)).allowed].sort());
  // (loadCommercialAccess hierboven heeft het overzetten al uitgevoerd; nog eens draaien verandert niets.)
  access.resetAccessReady();
  assert.equal((await access.reconcileAccess()).rebuilt, 0);

  assert.deepEqual(await roleNames(legacyAdmin.id), ["Communicatie", "Hoofdadmin"]);
  assert.deepEqual(await roleNames(both.id), ["Communicatie", "Ticketingbeheerder"]);
  assert.deepEqual(await roleNames(nobody.id), []);
  assert.deepEqual(await roleNames(czWithRole.id), ["Communicatie", "Relatiebeheerder"]);
  assert.deepEqual(await roleNames(czNoRole.id), ["Commerciële Zaken (basistoegang)", "Ticketing"]);
  assert.deepEqual(await roleNames(czOnly.id), ["Alleen lezen"]);

  // Inlogtoken-rollen blijven gelijk in betekenis; CZ-rechten (incl. persoonlijke uitzonderingen) exact gelijk.
  assert.ok((await db.user.findUniqueOrThrow({ where: { id: legacyAdmin.id } })).roles.includes("ADMIN"));
  assert.deepEqual((await db.user.findUniqueOrThrow({ where: { id: nobody.id } })).roles, ["USER"]);
  for (const [id, perms] of before) assert.deepEqual([...(await authz.loadCommercialAccess(id)).allowed].sort(), perms);
  assert.deepEqual(before.get(czWithRole.id), ["companies:read", "companies:update"]);
  assert.deepEqual(before.get(czNoRole.id), ["companies:read"]);

  // Alle standaardrollen staan klaar, ook ongebruikte CZ-rollen; de vaste Hoofdadmin-rol is er één keer.
  const all = (await db.accessRole.findMany()).map((r) => r.name);
  for (const n of ["Hoofdadmin", "Communicatie", "Communicatiebeheerder", "Ticketing", "Ticketingbeheerder", "Relatiebeheerder", "Alleen lezen"]) assert.ok(all.includes(n), n);
  assert.equal(await db.accessRole.count({ where: { isSystem: true } }), 1);
});

test("wijzigingen buiten het rollensysteem om worden opgepikt", { skip }, async () => {
  const u = await db.user.findUniqueOrThrow({ where: { email: `beide${MAIL}` } });
  // Zoals de oude versie dat zou doen: rolveld en CZ-lidmaatschap direct aanpassen.
  await db.user.update({ where: { id: u.id }, data: { roles: ["HUB_ADMIN"] } });
  const cr = await db.commercialRole.findUniqueOrThrow({ where: { key: "alleen-lezen" } });
  await db.commercialMembership.create({ data: { userId: u.id, roleId: cr.id } });
  assert.equal((await access.reconcileAccess()).rebuilt, 1);
  assert.deepEqual(await roleNames(u.id), ["Alleen lezen", "Communicatiebeheerder"]);
  assert.equal((await access.reconcileAccess()).rebuilt, 0);
});

test("rollen aanmaken, toewijzen, aanpassen en verwijderen werkt overal door", { skip }, async () => {
  const admin = await db.user.findUniqueOrThrow({ where: { email: `oudeadmin${MAIL}` } });
  const target = await mkUser("vrijwilliger", { roles: ["USER"] });
  const boss = await actorOf(admin.id);

  // Eén rol voor meerdere onderdelen tegelijk.
  const mixed = await access.createAccessRole(boss, { name: "Vrijwilliger", description: "Communicatie en een beetje CZ", hubLevel: "USER", ticketingLevel: "NONE", commercial: ["companies:read"] });
  await rejects(access.createAccessRole(boss, { name: "Vrijwilliger", hubLevel: "NONE", ticketingLevel: "NONE", commercial: null }), 409);
  await rejects(access.createAccessRole(boss, { name: "Fout", hubLevel: "NONE", ticketingLevel: "NONE", commercial: ["companies:update"] }), 400); // wijzigen zonder lezen

  await access.setUserRoles(boss, target.id, [mixed.id]);
  let row = await db.user.findUniqueOrThrow({ where: { id: target.id }, include: { commercialMembership: true } });
  assert.deepEqual(row.roles, ["HUB"]);
  assert.ok(row.commercialMembership);
  assert.ok((await authz.loadCommercialAccess(target.id)).can("companies:read"));

  // Rol aanpassen: geldt direct voor iedereen met de rol.
  await access.updateAccessRole(boss, mixed.id, { name: "Vrijwilliger", hubLevel: "USER", ticketingLevel: "USER", commercial: null });
  row = await db.user.findUniqueOrThrow({ where: { id: target.id }, include: { commercialMembership: true } });
  assert.deepEqual(row.roles, ["HUB", "TICKETING"]);
  assert.equal(row.commercialMembership, null);
  assert.equal((await authz.loadCommercialAccess(target.id)).isMember, false);

  // Verwijderen: de gebruiker verliest wat de rol gaf.
  assert.deepEqual(await access.deleteAccessRole(boss, mixed.id), { removedFrom: 1 });
  assert.deepEqual((await db.user.findUniqueOrThrow({ where: { id: target.id } })).roles, ["USER"]);

  // De vaste Hoofdadmin-rol is niet te verwijderen of in te perken.
  const adminRole = await db.accessRole.findFirstOrThrow({ where: { isSystem: true } });
  await rejects(access.deleteAccessRole(boss, adminRole.id), 403);
  await access.updateAccessRole(boss, adminRole.id, { name: "Hoofdadmin", hubLevel: "NONE", ticketingLevel: "NONE", commercial: null });
  assert.equal((await db.accessRole.findUniqueOrThrow({ where: { id: adminRole.id } })).isAdmin, true);

  // Er blijft altijd een hoofdadmin over.
  const adminRoles = (await db.userAccessRole.findMany({ where: { userId: admin.id } })).map((r) => r.roleId);
  await rejects(access.setUserRoles(boss, admin.id, adminRoles.filter((id) => id !== adminRole.id)), 400);

  const events = (await db.commercialAuditEvent.findMany()).map((e) => e.action);
  for (const a of ["access.migrated", "access.role.create", "access.role.update", "access.role.delete", "access.user.roles"]) assert.ok(events.includes(a), a);
});

test("beheerder van een onderdeel: alleen gebruikerstoegang tot dat onderdeel, niet bij zichzelf", { skip }, async () => {
  const hubAdmin = await db.user.findUniqueOrThrow({ where: { email: `beide${MAIL}` } }); // Communicatiebeheerder
  const target = await db.user.findUniqueOrThrow({ where: { email: `niemand${MAIL}` } });
  const actor = await actorOf(hubAdmin.id);
  const byName = async (name: string) => (await db.accessRole.findUniqueOrThrow({ where: { name } })).id;

  await access.setUserRoles(actor, target.id, [await byName("Communicatie")]);
  assert.deepEqual((await db.user.findUniqueOrThrow({ where: { id: target.id } })).roles, ["HUB"]);
  await rejects(access.setUserRoles(actor, target.id, [await byName("Communicatie"), await byName("Ticketing")]), 403);
  await rejects(access.setUserRoles(actor, target.id, [await byName("Communicatiebeheerder")]), 403);
  await rejects(access.setUserRoles(actor, hubAdmin.id, []), 403);
  await rejects(access.createAccessRole(actor, { name: "Te ruim", hubLevel: "USER", ticketingLevel: "USER", commercial: null }), 403);
  const own = await access.createAccessRole(actor, { name: "Fotograaf", hubLevel: "USER", ticketingLevel: "NONE", commercial: null });
  const roles = await access.listRoles(actor.scope);
  assert.equal(roles.find((r) => r.id === own.id)!.manageable, true);
  assert.equal(roles.find((r) => r.name === "Hoofdadmin")!.manageable, false);
});
