// Integratietest herinneringen. Er wordt nooit echt gemaild: de verzendfunctie wordt vervangen.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { noticeThreshold } from "../reminders.server";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

test("opzegdrempels", () => {
  assert.equal(noticeThreshold(-1), null);
  assert.equal(noticeThreshold(0), 7);
  assert.equal(noticeThreshold(7), 7);
  assert.equal(noticeThreshold(8), 14);
  assert.equal(noticeThreshold(30), 30);
  assert.equal(noticeThreshold(31), null);
});

let db: typeof import("@/lib/prisma").prisma;
let svc: typeof import("../service.server");
let authz: typeof import("../authz.server");
let ctxMod: typeof import("../ctx.server");
let co: typeof import("../companies.server");
let ct: typeof import("../contracts.server");
let tk: typeof import("../tasks.server");
let rm: typeof import("../reminders.server");

async function mkUser(key: string) {
  const u = await db.user.create({ data: { name: key, email: `${key}@rem.test`, passwordHash: "x", roles: ["HUB"] as never } });
  return { id: u.id, name: key, email: u.email, roles: ["HUB"] };
}

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../service.server");
  authz = await import("../authz.server");
  ctxMod = await import("../ctx.server");
  co = await import("../companies.server");
  ct = await import("../contracts.server");
  tk = await import("../tasks.server");
  rm = await import("../reminders.server");
  for (const t of ["commercialReminderLog", "commercialIndexation", "commercialOpportunity", "commercialCounterpart", "commercialContract", "commercialPackageItem", "commercialPackage", "commercialSeason", "commercialFile", "commercialTask", "commercialActivity", "commercialContact", "commercialCompany", "commercialTeam", "commercialAuditEvent", "commercialMembership", "commercialRole"] as const) {
    await (db[t] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await db.user.deleteMany({ where: { email: { endsWith: "@rem.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (!skip) await db.$disconnect();
});

test("herinneringen: eenmalig, alleen voor wie mag, geen bedragen, herstel bij mislukking", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await svc.buildActor({ ...(await mkUser("adm")), roles: ["ADMIN", "HUB"] });
  const [mgr, outsider] = [await mkUser("mgr"), await mkUser("out")];
  await svc.grantMembership(admin, mgr.id, await role("beheerder"));
  const cm = await ctxMod.buildRecordCtx(mgr);

  const now = new Date("2026-10-13T08:00:00Z");
  const season = await ct.saveSeason(cm, null, { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30", status: "ACTIVE" });
  const pkg = await ct.savePackage(cm, null, { name: "Zilver", items: [{ title: "Bord" }] });
  const company = await co.createCompany(cm, { name: "Smit Installatie", ownerId: mgr.id });
  const contractId = await ct.createContract(cm, company.id, { seasonId: season, packageId: pkg, startsOn: "2026-07-01", endsOn: "2027-06-30", amountCents: 987_654, noticeUntil: "2026-10-20" });
  await ct.setContractStatus(cm, contractId, "ACTIVE");
  await tk.createTask(cm, { title: "Offerte nabellen", companyId: company.id, assigneeId: mgr.id, dueAt: new Date("2026-10-12T10:00:00Z") });
  await tk.createTask(cm, { title: "Later", assigneeId: mgr.id, dueAt: new Date("2026-10-20T10:00:00Z") });
  // Taak voor iemand zonder toegang tot Commerciële Zaken: nooit een mail.
  await db.commercialTask.create({ data: { title: "Voor buitenstaander", assigneeId: outsider.id, dueAt: new Date("2026-10-12T10:00:00Z") } });

  const sent: Awaited<Parameters<typeof rm.runReminders>[1] extends (d: infer D) => unknown ? D : never>[] = [];
  const first = await rm.runReminders(now, async (d) => { sent.push(d); });
  assert.deepEqual(first, { recipients: 1, tasks: 1, notices: 1, contacts: 0, failed: 0 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].email, mgr.email);
  assert.equal(sent[0].tasks[0].title, "Offerte nabellen");
  assert.equal(sent[0].notices[0].daysLeft, 7);
  assert.ok(!JSON.stringify(sent).includes("987654") && !JSON.stringify(sent).includes("9876"));

  // Tweede run: niets nieuws.
  assert.deepEqual(await rm.runReminders(now, async () => assert.fail("mag niet opnieuw mailen")), { recipients: 0, tasks: 0, notices: 0, contacts: 0, failed: 0 });

  // Volgende drempel (nog 5 dagen is dezelfde drempel 7; 14 dagen eerder was een andere) en mislukte verzending wordt opnieuw geprobeerd.
  await db.commercialReminderLog.deleteMany();
  const failed = await rm.runReminders(now, async () => { throw new Error("Resend down"); });
  assert.equal(failed.failed, 1);
  assert.equal(await db.commercialReminderLog.count(), 0);
  assert.equal((await rm.runReminders(now, async () => {})).recipients, 1);

  // Zelf uitgezet in het profiel: geen herinneringsmail meer.
  await db.commercialReminderLog.deleteMany();
  await db.user.update({ where: { id: mgr.id }, data: { notifyCommercialDigest: false } });
  assert.deepEqual(await rm.runReminders(now, async () => assert.fail("mag niet mailen")), { recipients: 0, tasks: 0, notices: 0, contacts: 0, failed: 0 });
});
