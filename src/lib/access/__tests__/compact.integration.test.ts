// Integratietest tegen een echte Postgres. Wordt overgeslagen zonder TEST_DATABASE_URL.
// Het overzetten naar de compacte indeling vanuit de situatie zoals in productie (na PR #90):
// niemand krijgt meer of minder rechten, eigen rollen blijven ongemoeid.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;
process.env.COMMERCIAL_ENABLED = "true";
(process.env as Record<string, string>).NODE_ENV = "test";

type Access = typeof import("../service.server");
type Db = typeof import("@/lib/prisma");
let access: Access, db: Db["prisma"];

before(async () => {
  if (skip) return;
  access = await import("../service.server");
  db = (await import("@/lib/prisma")).prisma;
  await db.userAccessRole.deleteMany();
  await db.accessRole.deleteMany();
  await db.accessRolePreset.deleteMany();
  await db.commercialAuditEvent.deleteMany();
  await db.commercialMembership.deleteMany();
  await db.commercialRole.deleteMany();
  await db.user.deleteMany();
});

after(async () => {
  if (!skip) await db.$disconnect();
});

/** Wat iemand in totaal mag, los van rolnamen. */
async function grantOfUser(userId: string) {
  const rows = await db.userAccessRole.findMany({ where: { userId }, include: { role: { include: { commercialRole: true } } } });
  const c = await import("../model").then((m) => m.combine(rows.map((r) => access.grantOf(r.role))));
  const tickets = [...new Set(rows.filter((r) => r.role.ticketsAccess).flatMap((r) => r.role.ticketsPermissions))].sort();
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { commercialMembership: true } });
  return { ...c, tickets, appRoles: [...u.roles].sort(), member: !!u.commercialMembership };
}

test("overzetten vanuit productie-situatie: rechten per persoon exact gelijk", { skip }, async () => {
  const mk = (name: string, roles: string[]) => db.user.create({ data: { name, email: `${name}@compact.test`, passwordHash: "x", roles: roles as never } });
  const role = (data: Parameters<typeof db.accessRole.create>[0]["data"]) => db.accessRole.create({ data });

  const admin = await role({ name: "Hoofdadmin", isSystem: true, isAdmin: true });
  const comm = await role({ name: "Communicatie", hubLevel: "USER" });
  const commAdmin = await role({ name: "Communicatiebeheerder", hubLevel: "ADMIN" });
  const ks = await role({ name: "Klantenservice", ticketingLevel: "USER" });
  const ksAdmin = await role({ name: "Klantenservicebeheerder", ticketingLevel: "ADMIN" });
  const relCr = await db.commercialRole.create({ data: { key: "relatiebeheerder", name: "Relatiebeheerder", permissions: ["companies:read", "companies:update"], isSystem: true } });
  const rel = await role({ name: "Relatiebeheerder", commercialRoleId: relCr.id });
  const finCr = await db.commercialRole.create({ data: { key: "financieel-medewerker", name: "Financieel medewerker", permissions: ["invoices:read"], isSystem: true } });
  await role({ name: "Financieel medewerker", commercialRoleId: finCr.id });
  const scCr = await db.commercialRole.create({ data: { key: "sponsorcommissielid", name: "Sponsorcommissielid", permissions: ["companies:read"], isSystem: true } });
  await role({ name: "Sponsorcommissielid", commercialRoleId: scCr.id });
  const ksMw = await role({ name: "Klantenservicemedewerker", presetKey: "ks-medewerker", ticketingLevel: "USER", ticketsAccess: true, ticketsPermissions: ["support:search", "tickets:read"] });
  const scanner = await role({ name: "Scanner", presetKey: "tickets-scanner", ticketsAccess: true, ticketsPermissions: ["scan:scan"] });
  const custom = await role({ name: "Vrijwilliger wedstrijddag", hubLevel: "USER" });
  for (const key of ["ks-medewerker", "tickets-beheerder", "tickets-scanner"]) {
    await db.accessRolePreset.create({ data: { key, roleId: key === "ks-medewerker" ? ksMw.id : key === "tickets-scanner" ? scanner.id : null } });
  }
  // Ticketbeheerder (PR #90) is bewust verwijderd: hij komt niet terug.

  const jermaine = await mk("jermaine", ["ADMIN", "HUB"]);
  const anouk = await mk("anouk", ["HUB_ADMIN"]);
  const bram = await mk("bram", ["TICKETING"]);
  const sanne = await mk("sanne", ["HUB"]);
  const kees = await mk("kees", ["TICKETING", "HUB"]);
  const assign = async (u: { id: string }, ...rs: { id: string }[]) => {
    await db.userAccessRole.createMany({ data: rs.map((r) => ({ userId: u.id, roleId: r.id })) });
    await db.$transaction((tx) => access.syncUserAccess(tx, u.id));
  };
  await assign(jermaine, admin, comm);
  await assign(anouk, commAdmin);
  await assign(bram, ks);
  await assign(sanne, comm, rel);
  await assign(kees, ksMw, custom, scanner);

  const people = [jermaine, anouk, bram, sanne, kees];
  const beforeGrant = new Map(await Promise.all(people.map(async (u) => [u.id, await grantOfUser(u.id)] as const)));

  access.resetAccessReady();
  await access.reconcileAccess();
  await access.reconcileAccess(); // nog eens: verandert niets

  for (const u of people) assert.deepEqual(await grantOfUser(u.id), beforeGrant.get(u.id), u.name);

  const name = async (id: string) => (await db.accessRole.findUnique({ where: { id } }))?.name ?? null;
  assert.equal(await name(comm.id), "Communicatie – medewerker");
  assert.equal(await name(commAdmin.id), "Communicatie – beheerder");
  assert.equal(await name(ks.id), "Klantenservice – basis");
  assert.equal(await name(ksAdmin.id), "Klantenservice – beheerder");
  assert.equal(await name(rel.id), "Commerciële Zaken – medewerker");
  assert.equal(await name(ksMw.id), "Klantenservice – medewerker");
  assert.equal(await name(scanner.id), "Tickets – scanner");
  assert.equal(await name(custom.id), "Vrijwilliger wedstrijddag");
  assert.equal(await name(admin.id), "Hoofdadmin");

  // Gebruikt: rechten ongewijzigd (ook afwijkend). Ongebruikt: standaardrechten.
  assert.deepEqual((await db.accessRole.findUniqueOrThrow({ where: { id: ksMw.id } })).ticketsPermissions, ["support:search", "tickets:read"]);
  const ksAdminNow = await db.accessRole.findUniqueOrThrow({ where: { id: ksAdmin.id } });
  assert.ok(ksAdminNow.ticketsAccess && ksAdminNow.ticketsPermissions.includes("tickets:block"));
  const fin = await db.accessRole.findFirstOrThrow({ where: { presetKey: "cz-financien" }, include: { commercialRole: true } });
  assert.ok(fin.commercialRole!.permissions.includes("invoices:send"));

  // Ongebruikte oude standaardrol zonder plek: weg. Bewust verwijderde standaardrol: komt niet terug.
  assert.equal(await db.accessRole.count({ where: { name: "Sponsorcommissielid" } }), 0);
  assert.equal(await db.accessRole.count({ where: { presetKey: "tickets-beheerder" } }), 0);
  // Nieuwe standaardrollen bestaan, zonder dat iemand ze kreeg.
  for (const key of ["ks-teamleider", "ks-beheerder", "cz-beheerder", "tickets-alleen-lezen"]) {
    const r = await db.accessRole.findFirst({ where: { presetKey: key }, include: { _count: { select: { users: true } } } });
    assert.ok(r, key);
    if (key !== "ks-beheerder") assert.equal(r!._count.users, 0, key);
  }
  assert.equal((await db.commercialAuditEvent.findMany({ where: { action: "access.compacted" } })).length, 1);
});
