// Integratietest recordbereik en bevoegdheden op dossiers/taken, tegen een echte Postgres.
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
let tk: typeof import("../tasks.server");
let tm: typeof import("../teams.server");
const ids: Record<string, string> = {};

async function mkUser(key: string, roles: string[] = ["HUB"]) {
  const u = await db.user.create({ data: { name: key, email: `${key}@rec.test`, passwordHash: "x", roles: roles as never } });
  ids[key] = u.id;
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
  tm = await import("../teams.server");
  await db.commercialIndexation.deleteMany();
  await db.commercialOpportunity.deleteMany();
  await db.commercialCounterpart.deleteMany();
  await db.commercialContract.deleteMany();
  await db.commercialFile.deleteMany();
  await db.commercialTask.deleteMany();
  await db.commercialActivity.deleteMany();
  await db.commercialContact.deleteMany();
  await db.commercialCompany.deleteMany();
  await db.commercialTeam.deleteMany();
  await db.commercialAuditEvent.deleteMany();
  await db.commercialMembership.deleteMany();
  await db.commercialRole.deleteMany();
  await db.user.deleteMany({ where: { email: { endsWith: "@rec.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (!skip) await db.$disconnect();
});

test("recordbereik, eigenaarschap, concurrency en bevoegdheden", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await mkUser("admin", ["ADMIN", "HUB"]);
  const mgr = await mkUser("mgr");
  const a = await mkUser("a"); // eigen bereik
  const b = await mkUser("b"); // alles
  const c = await mkUser("c"); // teamgenoot van a
  const ro = await mkUser("ro"); // alleen lezen

  const adm = await svc.buildActor(admin);
  await svc.grantMembership(adm, mgr.id, await role("beheerder"));
  for (const [u, r] of [[a, "relatiebeheerder"], [b, "sponsorcommissielid"], [c, "relatiebeheerder"], [ro, "alleen-lezen"]] as const) {
    await svc.grantMembership(adm, u.id, await role(r));
  }
  const mgrActor = await svc.buildActor(mgr);
  await svc.setMemberScopes(mgrActor, a.id, { companies: "OWN", tasks: "OWN" });
  await svc.setMemberScopes(mgrActor, c.id, { companies: "TEAM", tasks: "TEAM" });
  await rejects(svc.setMemberScopes(await svc.buildActor(a), b.id, { companies: "OWN" }), 403); // a beheert geen rechten

  const ca = await ctxMod.buildRecordCtx(a);
  const cb = await ctxMod.buildRecordCtx(b);
  const cc = await ctxMod.buildRecordCtx(c);
  const cro = await ctxMod.buildRecordCtx(ro);
  const cm = await ctxMod.buildRecordCtx(mgr);

  // b maakt een dossier; a (alleen eigen) ziet het niet en kan er niets mee.
  const x = await co.createCompany(cb, { name: "Bakkerij Jansen B.V.", city: "Hardenberg" });
  const y = await co.createCompany(ca, { name: "Garage De Vries" });
  assert.equal(y.ownerId, a.id);
  assert.deepEqual((await co.listCompanies(ca, {})).rows.map((r) => r.name), ["Garage De Vries"]);
  await rejects(co.getCompany(ca, x.id), 404);
  await rejects(co.updateCompany(ca, x.id, { version: 1, city: "Zwolle" }), 404);
  await rejects(co.createContact(ca, x.id, { name: "Piet" }), 404);
  await rejects(co.listActivities(ca, x.id), 404);
  await rejects(co.setCompanyArchived(ca, x.id, true), 403); // a heeft companies:archive niet via rol
  await rejects(tk.createTask(ca, { title: "Bellen", companyId: x.id }), 404);

  // Eigenaarschap: a kan zichzelf geen toegang geven door eigenaar te wijzigen of voor een ander aan te maken.
  await rejects(co.createCompany(ca, { name: "Voor b", ownerId: b.id }), 403);
  await rejects(co.updateCompany(ca, y.id, { version: 1, ownerId: b.id }), 403);

  // Dubbelcontrole lekt niets buiten bereik.
  const dup = await co.findDuplicates(ca, { name: "bakkerij jansen bv" });
  assert.deepEqual(dup, { visible: [], hiddenCount: 1 });

  // Concurrency.
  await co.updateCompany(cb, x.id, { version: 1, city: "Zwolle" });
  await rejects(co.updateCompany(cb, x.id, { version: 1, city: "Meppel" }), 409);

  // Team: c ziet dossiers van het eigen team, niet van anderen.
  const team = await tm.createTeam(cm, "Acquisitie");
  await rejects(tm.setTeamMembers(cm, team.id, [mgr.id, c.id]), 403); // niet je eigen lidmaatschap
  await tm.setTeamMembers(cm, team.id, [c.id, a.id]);
  const cc2 = await ctxMod.buildRecordCtx(c);
  const ca2 = await ctxMod.buildRecordCtx(a);
  const teamCo = await co.createCompany(cb, { name: "Teamdossier", teamId: null });
  await db.commercialCompany.update({ where: { id: teamCo.id }, data: { teamId: team.id } });
  await rejects(co.getCompany(ca2, teamCo.id), 404); // a heeft bereik 'eigen', ook al zit a in het team
  await svc.setMemberScopes(mgrActor, a.id, { companies: "TEAM" });
  assert.equal((await co.getCompany(await ctxMod.buildRecordCtx(a), teamCo.id)).name, "Teamdossier");
  assert.ok((await co.getCompany(cc2, teamCo.id)).id);
  await rejects(co.getCompany(cc2, x.id), 404);
  await svc.setMemberScopes(mgrActor, a.id, { companies: "OWN" });

  // Bevoegdheden zijn onafhankelijk van bereik: alleen-lezen kan niets schrijven.
  await rejects(co.createCompany(cro, { name: "Nee" }), 403);
  await rejects(tk.createTask(cro, { title: "Nee" }), 403);
  assert.ok((await co.listCompanies(cro, {})).total >= 3);

  // Taken: afronden is een schrijfactie; bedrijfsnaam buiten bereik lekt niet.
  const task = await tk.createTask(cb, { title: "Offerte sturen", companyId: x.id, assigneeId: a.id });
  const listed = (await tk.listTasks(ca, {})).rows.find((t) => t.id === task.id)!;
  assert.equal(listed.companyName, null);
  assert.equal(listed.companyId, null);
  await rejects(tk.setTaskDone(cro, task.id, true), 403); // afvinken vereist tasks:update
  await tk.setTaskDone(ca, task.id, true);
  const done = await db.commercialTask.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal(done.status, "DONE");
  assert.equal(done.completedById, a.id);
  await tk.setTaskDone(ca, task.id, false);
  assert.equal((await db.commercialTask.findUniqueOrThrow({ where: { id: task.id } })).completedAt, null);
  await rejects(tk.createTask(ca, { title: "Voor b", assigneeId: b.id }), 403); // bereik eigen: alleen aan jezelf

  // Contacthistorie met vervolgtaak in één transactie.
  const act = await co.createActivity(cb, x.id, {
    kind: "CALL",
    occurredAt: new Date(),
    summary: "Gebeld over verlenging",
    nature: "PROVISIONAL",
    followUpTask: { title: "Terugbellen" },
  });
  assert.equal((await db.commercialTask.count({ where: { activityId: act.id } })), 1);
  assert.equal((await co.listActivities(cb, x.id))[0].nature, "PROVISIONAL");

  // Intrekken van toegang werkt direct en blokkeert nieuwe verzoeken.
  await svc.revokeMembership(adm, c.id);
  await assert.rejects(ctxMod.buildRecordCtx(c), (e: { status?: number }) => e.status === 403);

  // Eigenaarswijzigingen zijn gelogd.
  const cb2 = await ctxMod.buildRecordCtx(b);
  await rejects(co.updateCompany(cb2, x.id, { version: 2, ownerId: c.id }), 400); // c heeft geen toegang meer
  await co.updateCompany(cb2, x.id, { version: 2, ownerId: a.id });
  const events = await db.commercialAuditEvent.findMany();
  for (const action of ["member.scopes", "team.members", "company.owner"]) assert.ok(events.some((e) => e.action === action), action);
});
