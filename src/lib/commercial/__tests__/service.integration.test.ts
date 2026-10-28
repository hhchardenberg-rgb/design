// Integratietest tegen een echte Postgres. Wordt overgeslagen zonder
// TEST_DATABASE_URL, zodat `npm test` ook zonder database werkt.
// Gebruik: TEST_DATABASE_URL=postgresql://... npm test (schema via prisma migrate deploy).
import { before, after, test } from "node:test";
import assert from "node:assert/strict";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;
// Beheerders van Commerciële Zaken wijzen rollen toe via het gewone rollensysteem; dat kijkt naar de featureflag.
process.env.COMMERCIAL_ENABLED = "true";

type Svc = typeof import("../service.server");
type Authz = typeof import("../authz.server");
type Db = typeof import("@/lib/prisma");
type Access = typeof import("@/lib/access/service.server");
type Managers = typeof import("@/lib/user-managers.server");

let svc: Svc, authz: Authz, db: Db["prisma"], access: Access, managers: Managers;
const ids: Record<string, string> = {};

async function mkUser(key: string, roles: string[] = ["HUB"]) {
  const u = await db.user.create({ data: { name: key, email: `${key}@test.local`, passwordHash: "x", roles: roles as never } });
  ids[key] = u.id;
  return { id: u.id, name: key, email: u.email, roles };
}
const actorOf = (u: { id: string; name: string; email: string; roles: string[] }) => svc.buildActor(u);
async function rejects(p: Promise<unknown>, status: number) {
  await assert.rejects(p, (e: { status?: number }) => e.status === status);
}

before(async () => {
  if (skip) return;
  svc = await import("../service.server");
  authz = await import("../authz.server");
  access = await import("@/lib/access/service.server");
  managers = await import("@/lib/user-managers.server");
  db = (await import("@/lib/prisma")).prisma;
  await db.commercialAuditEvent.deleteMany();
  await db.commercialMembership.deleteMany();
  await db.commercialRole.deleteMany();
  await db.user.deleteMany({ where: { email: { endsWith: "@test.local" } } });
  await authz.ensureSystemRoles();
});

after(async () => {
  if (skip) return;
  await db.$disconnect();
});

test("end-to-end rechtenbeheer", { skip }, async () => {
  const admin = await mkUser("admin", ["ADMIN", "HUB"]);
  const u1 = await mkUser("u1");
  const u2 = await mkUser("u2");
  const u3 = await mkUser("u3");
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  // De Hub-rol die bij een CZ-rol hoort, en een beheerder zoals het beheerscherm die opbouwt.
  const hubRole = async (key: string) => { const id = await role(key); return (await db.$transaction((tx) => access.accessRoleForCommercial(tx, id))).id; };
  const managerOf = async (u: { id: string; name: string; email: string }) => (await managers.managerFor({ ...u, roles: (await db.user.findUniqueOrThrow({ where: { id: u.id } })).roles }))!.actor;

  // Hoofdadmin: automatisch volledige toegang, zonder lidmaatschap.
  const adminAccess = await authz.loadCommercialAccess(admin.id);
  assert.equal(adminAccess.isMember, true);
  assert.ok(adminAccess.can("amounts:read") && adminAccess.can("rights:manage_rights") && adminAccess.isPlatformAdmin);
  await rejects(svc.grantMembership(await actorOf(admin), admin.id, null), 409); // heeft al alles

  // Zonder rechtenbeheer kan niemand toegang geven; een hoofdadmin wel.
  await rejects(svc.grantMembership(await actorOf(u1), u2.id, null), 403);
  await svc.grantMembership(await actorOf(admin), u1.id, await role("beheerder"));
  await rejects(svc.grantMembership(await actorOf(admin), u1.id, null), 409);
  assert.ok((await authz.loadCommercialAccess(u1.id)).can("rights:manage_rights"));

  // Een beheerder van Commerciële Zaken (rechtenbeheer) mag ook toegang geven en intrekken, binnen de eigen grens.
  const u4 = await mkUser("u4");
  await svc.grantMembership(await actorOf(u1), u4.id, await role("alleen-lezen"));
  assert.equal((await authz.loadCommercialAccess(u4.id)).isMember, true);
  await svc.revokeMembership(await actorOf(u1), u4.id);
  assert.equal((await authz.loadCommercialAccess(u4.id)).isMember, false);

  // De beheerder deelt een rol uit; een gewone rol kan geen rechten beheren.
  await svc.grantMembership(await actorOf(admin), u2.id, null);
  // De CZ-beheerder ruilt de basistoegang voor een CZ-rol; de overige rollen van u2 blijven staan.
  const u2before = await db.userAccessRole.findMany({ where: { userId: u2.id }, include: { role: true } });
  await access.setUserRoles(await managerOf(u1), u2.id, [...u2before.filter((a) => !a.role.commercialRoleId).map((a) => a.roleId), await hubRole("sponsorcommissielid")]);
  const a2 = await authz.loadCommercialAccess(u2.id);
  assert.ok(a2.can("companies:update") && !a2.can("invoices:read") && !a2.can("rights:manage_rights"));
  await rejects(svc.setMemberPermissions(await actorOf(u2), u1.id, []), 403);

  // Eigen rechten aanpassen kan niet.
  await rejects(svc.setMemberPermissions(await actorOf(u1), u1.id, []), 403);

  // Individuele blokkade wint van de rol; leesrecht weg laat afhankelijke rechten vervallen.
  const current = [...a2.allowed].filter((p) => p !== "companies:read");
  await rejects(svc.setMemberPermissions(await actorOf(u1), u2.id, current), 400); // inconsistent: update zonder read
  const noCompanies = [...a2.allowed].filter((p) => !p.startsWith("companies:"));
  await svc.setMemberPermissions(await actorOf(u1), u2.id, noCompanies);
  const a2b = await authz.loadCommercialAccess(u2.id);
  assert.ok(!a2b.can("companies:read") && !a2b.can("companies:update") && a2b.can("contacts:update"));

  // Individueel toestaan binnen de grens van de actor.
  await svc.setMemberPermissions(await actorOf(u1), u2.id, [...noCompanies, "files:download"]);
  assert.ok((await authz.loadCommercialAccess(u2.id)).can("files:download"));

  // Delegatiegrens: een rechtenbeheerder met beperkte rechten kan niet meer uitdelen dan hij zelf heeft.
  const light = await access.createAccessRole(await managerOf(u1), {
    name: "Rechtenbeheer beperkt",
    hubLevel: "NONE",
    ticketingLevel: "NONE",
    commercial: ["rights:read", "rights:manage_rights", "companies:read"],
  });
  await svc.grantMembership(await actorOf(admin), u3.id, light.commercialRoleId);
  await rejects(svc.setMemberPermissions(await actorOf(u3), u2.id, [...noCompanies, "invoices:read", "invoices:approve"]), 403);
  const u2roles = (await db.userAccessRole.findMany({ where: { userId: u2.id } })).map((r) => r.roleId);
  await rejects(access.setUserRoles(await managerOf(u3), u2.id, [...u2roles, await hubRole("financieel-medewerker")]), 403);
  // Een rol die buiten Commerciële Zaken toegang geeft, valt buiten het beheer van een CZ-beheerder.
  const hubOnly = await access.createAccessRole(await managerOf(admin), { name: "Alleen communicatie", hubLevel: "USER", ticketingLevel: "NONE", commercial: null });
  await rejects(access.setUserRoles(await managerOf(u1), u2.id, [...u2roles, hubOnly.id]), 403);

  // Een hoofdadmin telt altijd als rechtenbeheerder: toegang kan dus nooit "zonder beheerder" raken.
  await svc.revokeMembership(await actorOf(admin), u3.id);

  // Een rol aanpassen die het laatste rechtenbeheer weghaalt, wordt geweigerd.
  await svc.grantMembership(await actorOf(admin), u3.id, null);
  const bossRole = await hubRole("beheerder");
  await rejects(access.updateAccessRole(await managerOf(u1), bossRole, { name: "Beheerder", hubLevel: "NONE", ticketingLevel: "NONE", commercial: ["companies:read"] }), 403); // eigen rol
  
  // Intrekken werkt direct.
  await svc.revokeMembership(await actorOf(admin), u2.id);
  const gone = await authz.loadCommercialAccess(u2.id);
  assert.equal(gone.isMember, false);
  assert.equal(gone.allowed.size, 0);

  // Alles is vastgelegd met actor en oud/nieuw.
  const events = await db.commercialAuditEvent.findMany({ orderBy: { createdAt: "asc" } });
  const actions = events.map((e) => e.action);
  for (const a of ["membership.grant", "access.user.roles", "member.permissions", "access.role.create", "membership.revoke"]) assert.ok(actions.includes(a), a);
  const permEvent = events.find((e) => e.action === "member.permissions")!;
  assert.equal(permEvent.actorId, u1.id);
  assert.ok(permEvent.before && permEvent.after);
});
