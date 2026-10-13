// Integratietest toezicht: logboek en overzicht per persoon. Overgeslagen zonder TEST_DATABASE_URL.
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
let ov: typeof import("../oversight.server");

async function mkUser(key: string) {
  const u = await db.user.create({ data: { name: key, email: `${key}@ovs.test`, passwordHash: "x", roles: ["HUB"] as never } });
  return { id: u.id, name: key, email: u.email, roles: ["HUB"] };
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
  ov = await import("../oversight.server");
  for (const t of ["commercialIndexation", "commercialOpportunity", "commercialCounterpart", "commercialContract", "commercialPackageItem", "commercialPackage", "commercialSeason", "commercialFile", "commercialTask", "commercialActivity", "commercialContact", "commercialCompany", "commercialTeam", "commercialAuditEvent", "commercialMembership", "commercialRole"] as const) {
    await (db[t] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await db.user.deleteMany({ where: { email: { endsWith: "@ovs.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (!skip) await db.$disconnect();
});

test("toezicht: alleen rechtenbeheerders, ook buiten eigen bereik, zonder bedragen", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await svc.buildActor({ ...(await mkUser("adm")), roles: ["ADMIN", "HUB"] });
  const [boss, lid, own] = [await mkUser("boss"), await mkUser("lid"), await mkUser("own")];
  await svc.grantMembership(admin, boss.id, await role("beheerder"));
  await svc.grantMembership(admin, lid.id, await role("alleen-lezen"));
  await svc.grantMembership(admin, own.id, await role("beheerder"));
  await svc.setMemberScopes(admin, boss.id, { companies: "OWN", tasks: "OWN" }); // beheerder met eigen bereik
  const cb = await ctxMod.buildRecordCtx(boss);
  const cl = await ctxMod.buildRecordCtx(lid);
  const co2 = await ctxMod.buildRecordCtx(own);

  const company = await co.createCompany(co2, { name: "Smit" });
  await tk.createTask(co2, { title: "Bel Smit", assigneeId: own.id, companyId: company.id, dueAt: new Date(Date.now() - 86_400_000) });

  // Rechten.
  await rejects(ov.listAuditLog(cl, {}), 403);
  await rejects(ov.listPeople(cl), 403);
  await rejects(ov.personOverview(cl, own.id), 403);

  // Logboek: filter op persoon en soort, datum.
  const all = await ov.listAuditLog(cb, {});
  assert.ok(all.total >= 1 && all.rows.some((r) => r.action === "company.create"));
  const mine = await ov.listAuditLog(cb, { actorId: own.id, actionPrefix: "company." });
  assert.ok(mine.rows.length >= 1 && mine.rows.every((r) => r.actorId === own.id && r.action.startsWith("company.")));
  assert.equal((await ov.listAuditLog(cb, { actorId: lid.id })).rows.length, 0);
  assert.equal((await ov.listAuditLog(cb, { from: "2999-01-01" })).rows.length, 0);
  await rejects(ov.listAuditLog(cb, { from: "morgen" }), 400);

  // Per persoon: de beheerder (bereik 'eigen') ziet toch de taak van een ander.
  const people = await ov.listPeople(cb);
  const p = people.find((x) => x.id === own.id)!;
  assert.equal(p.openTasks, 1);
  assert.equal(p.overdueTasks, 1);
  assert.equal(p.companies, 1);
  const d = await ov.personOverview(cb, own.id);
  assert.equal(d.tasks.length, 1);
  assert.equal(d.tasks[0].companyName, "Smit");
  assert.equal(d.tasks[0].overdue, true);
  assert.ok(d.activity.length >= 1);
  assert.equal(JSON.stringify(d).includes("Cents"), false, "geen bedragen in het overzicht");
  await rejects(ov.personOverview(cb, "bestaat-niet"), 404);
});
