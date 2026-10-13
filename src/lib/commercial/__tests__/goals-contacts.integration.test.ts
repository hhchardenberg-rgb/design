// Integratietest doelen/prognose en herinneringen aan contactmomenten. Er wordt nooit echt gemaild.
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
let ct: typeof import("../contracts.server");
let op: typeof import("../opportunities.server");
let gl: typeof import("../goals.server");
let cmo: typeof import("../contact-moments.server");
let rm: typeof import("../reminders.server");

async function mkUser(key: string) {
  const u = await db.user.create({ data: { name: key, email: `${key}@goal.test`, passwordHash: "x", roles: ["HUB"] as never } });
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
  ct = await import("../contracts.server");
  op = await import("../opportunities.server");
  gl = await import("../goals.server");
  cmo = await import("../contact-moments.server");
  rm = await import("../reminders.server");
  for (const t of ["commercialReminderLog", "commercialGoal", "commercialContactRule", "commercialIndexation", "commercialOpportunity", "commercialCounterpart", "commercialContract", "commercialPackageItem", "commercialPackage", "commercialSeason", "commercialFile", "commercialTask", "commercialActivity", "commercialContact", "commercialCompany", "commercialTeam", "commercialAuditEvent", "commercialMembership", "commercialRole"] as const) {
    await (db[t] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await db.user.deleteMany({ where: { email: { endsWith: "@goal.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (!skip) await db.$disconnect();
});

test("doelen en prognose: gerealiseerd, gewogen pijplijn, rechten en bereik", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await svc.buildActor({ ...(await mkUser("adm")), roles: ["ADMIN", "HUB"] });
  const [mgr, reader] = [await mkUser("mgr"), await mkUser("rdr")];
  await svc.grantMembership(admin, mgr.id, await role("beheerder"));
  await svc.grantMembership(admin, reader.id, await role("alleen-lezen"));
  const cm = await ctxMod.buildRecordCtx(mgr);

  const season = await ct.saveSeason(cm, null, { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30", status: "ACTIVE" });
  const pkg = await ct.savePackage(cm, null, { name: "Pakket", items: [{ title: "Bord" }] });
  const a = await co.createCompany(cm, { name: "Smit", sponsorTier: "HOOFD" });
  const b = await co.createCompany(cm, { name: "Bakker", sponsorTier: "GOUD" });
  const c = await co.createCompany(cm, { name: "Zonder" });
  for (const [comp, cents, activate] of [[a, 400_000, true], [b, 100_000, true], [c, 30_000, true], [b, 77_000, false]] as const) {
    const id = await ct.createContract(cm, comp.id, { seasonId: season, packageId: pkg, startsOn: "2026-07-01", endsOn: "2027-06-30", amountCents: cents });
    if (activate) await ct.setContractStatus(cm, id, "ACTIVE");
  }
  // Pijplijn: in het seizoen, buiten het seizoen, zonder datum, zonder bedrag.
  const mk = async (companyId: string, title: string, cents: number | null, closeOn: string | null, stage?: string) => {
    const id = await op.createOpportunity(cm, companyId, { title, expectedAmountCents: cents, expectedCloseOn: closeOn });
    if (stage) await db.commercialOpportunity.update({ where: { id: typeof id === "string" ? id : (id as { id: string }).id }, data: { stage } });
  };
  await mk(a.id, "Verlenging hoofd", 200_000, "2027-01-15", "NEGOTIATION"); // 75% = 150.000
  await mk(b.id, "Upgrade goud", 100_000, "2026-12-01", "LEAD"); // 10% = 10.000
  await mk(b.id, "Volgend seizoen", 500_000, "2027-09-01", "PROPOSAL"); // buiten seizoen
  await mk(c.id, "Zonder datum", 80_000, null, "PROPOSAL");
  await mk(c.id, "Zonder bedrag", null, "2027-02-01", "PROPOSAL");

  // Doelen zetten: valideren en bewaren.
  await rejects(gl.setGoals(cm, season, [{ tier: "BRONS", targetCents: 1 }]), 400);
  await rejects(gl.setGoals(cm, season, [{ tier: "ALL", targetCents: -5 }]), 400);
  await rejects(gl.setGoals(cm, season, [{ tier: "ALL", targetCents: 1 }, { tier: "ALL", targetCents: 2 }]), 400);
  await gl.setGoals(cm, season, [{ tier: "ALL", targetCents: 1_000_000 }, { tier: "HOOFD", targetCents: 600_000 }]);

  const g = await gl.getGoals(cm, season);
  const row = (k: string) => g.rows.find((r) => r.key === k)!;
  assert.equal(g.partial, false);
  assert.equal(row("ALL").realisedCents, 530_000); // concept van 77.000 telt niet mee
  assert.equal(row("ALL").draftCents, 77_000);
  assert.equal(row("ALL").pipelineWeightedCents, 160_000);
  assert.deepEqual(row("ALL").standing, { missingCents: 470_000, forecastCents: 690_000, shortfallCents: 310_000, progressPercent: 53 });
  assert.deepEqual(row("HOOFD").standing, { missingCents: 200_000, forecastCents: 550_000, shortfallCents: 50_000, progressPercent: 67 });
  assert.equal(row("GOUD").targetCents, null);
  assert.equal(row("GOUD").standing, null); // geen doel, dus geen stand
  assert.equal(row("NONE").realisedCents, 30_000);
  assert.equal(g.notes.undatedOpportunities, 1);
  assert.equal(g.notes.opportunitiesWithoutAmount, 1);

  // Doel verwijderen met null.
  await gl.setGoals(cm, season, [{ tier: "HOOFD", targetCents: null }]);
  assert.equal((await gl.getGoals(cm, season)).rows.find((r) => r.key === "HOOFD")!.targetCents, null);

  // Logboek bevat welke doelen zijn gewijzigd, maar geen bedragen.
  const events = await db.commercialAuditEvent.findMany({ where: { action: "goal.update" } });
  assert.equal(events.length, 2);
  assert.ok(!JSON.stringify(events).includes("1000000"));

  // Zonder bedragenrecht: alleen aantallen, geen doelen of cijfers; instellen mag niet.
  const cr = await ctxMod.buildRecordCtx(reader);
  const noAmounts = await gl.getGoals(cr, season).catch((e: { status?: number }) => e);
  if (cr.can("reports:read")) {
    const r = noAmounts as Awaited<ReturnType<typeof gl.getGoals>>;
    assert.equal(r.amountsVisible, false);
    assert.ok(r.rows.every((x) => x.targetCents == null && x.realisedCents == null && x.pipelineWeightedCents == null && x.standing == null));
    assert.equal(r.rows[0].contractCount, 3);
  } else {
    assert.equal((noAmounts as { status?: number }).status, 403);
  }
  await rejects(gl.setGoals(cr, season, [{ tier: "ALL", targetCents: 5 }]), 403);

  // Beperkt bereik: cijfers wel, maar geen vergelijking met het verenigingsdoel.
  await db.commercialMemberScope.create({ data: { membership: { connect: { userId: mgr.id } }, area: "companies", scope: "OWN" } }).catch(async () => {
    const m = await db.commercialMembership.findFirstOrThrow({ where: { userId: mgr.id } });
    await db.commercialMemberScope.create({ data: { membershipId: m.id, area: "companies", scope: "OWN" } });
  });
  const own = await gl.getGoals(await ctxMod.buildRecordCtx(mgr), season);
  assert.equal(own.partial, true);
  assert.ok(own.rows.every((r) => r.standing == null));
});

test("contactmomenten: termijn per sponsorvorm, geplande afspraak, herinnering eenmalig", { skip }, async () => {
  await db.commercialReminderLog.deleteMany();
  await db.commercialContactRule.deleteMany();
  await db.commercialActivity.deleteMany();
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await svc.buildActor({ ...(await mkUser("adm2")), roles: ["ADMIN", "HUB"] });
  const owner = await mkUser("own");
  await svc.grantMembership(admin, owner.id, await role("beheerder"));
  const cm = await ctxMod.buildRecordCtx(owner);
  const now = new Date("2026-10-13T08:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  const mk = (name: string, tier: string | null, status = "ACTIVE") => db.commercialCompany.create({ data: { name, nameKey: name.toLowerCase(), sponsorTier: tier, status, ownerId: owner.id, createdAt: daysAgo(400) } });
  const hoofdOud = await mk("Hoofd oud", "HOOFD");
  const hoofdRecent = await mk("Hoofd recent", "HOOFD");
  const hoofdGepland = await mk("Hoofd gepland", "HOOFD");
  const zilverOud = await mk("Zilver oud", "ZILVER");
  const zonderVorm = await mk("Zonder vorm oud", null);
  await mk("Prospect oud", "HOOFD", "PROSPECT"); // geen sponsor: niet gemeld
  const act = (companyId: string, occurredAt: Date, isPlanned = false) => db.commercialActivity.create({ data: { companyId, kind: "CALL", occurredAt, summary: "x", isPlanned } });
  await act(hoofdOud.id, daysAgo(100));
  await act(hoofdRecent.id, daysAgo(10));
  await act(hoofdGepland.id, daysAgo(120));
  await act(hoofdGepland.id, new Date(now.getTime() + 5 * 86_400_000), true); // staat al opvolging gepland
  await act(zilverOud.id, daysAgo(100));
  await act(zilverOud.id, new Date(now.getTime() - 86_400_000), true); // geplande afspraak in het verleden telt niet als contact

  // Zonder regels geen meldingen.
  assert.equal((await cmo.computeContactGaps(now)).length, 0);

  // Regels: valideren en opslaan; geen standaardwaarden.
  await rejects(cmo.setContactRules(cm, [{ tier: "BRONS", intervalDays: 30 }]), 400);
  await rejects(cmo.setContactRules(cm, [{ tier: "HOOFD", intervalDays: 0 }]), 400);
  await rejects(cmo.setContactRules(cm, [{ tier: "HOOFD", intervalDays: 30.5 }]), 400);
  await cmo.setContactRules(cm, [{ tier: "HOOFD", intervalDays: 60 }, { tier: "NONE", intervalDays: 180 }]);
  assert.deepEqual((await cmo.getContactRules(cm)).rules.filter((r) => r.intervalDays != null).map((r) => [r.tier, r.intervalDays]), [["HOOFD", 60], ["NONE", 180]]);

  const gaps = await cmo.computeContactGaps(now);
  assert.deepEqual(gaps.map((g) => [g.companyName, g.daysSince, g.overdueDays]), [["Zonder vorm oud", 400, 220], ["Hoofd oud", 100, 40]]); // zilver heeft geen regel
  assert.equal(gaps[0].lastContactOn, null); // nog nooit gesproken: geteld vanaf aanmaken

  const list = await cmo.listContactGaps(cm, { tiers: ["HOOFD"] });
  assert.deepEqual(list.rows.map((r) => r.companyName), ["Hoofd oud"]);
  assert.equal(list.rows[0].tierName, "Hoofd");
  await cmo.setContactRules(cm, [{ tier: "ZILVER", intervalDays: 90 }]);
  assert.deepEqual((await cmo.listContactGaps(cm, {})).rows.map((r) => r.companyName), ["Zonder vorm oud", "Hoofd oud", "Zilver oud"]);

  // Herinnering: eenmalig per sponsor, zonder bedragen; alleen voor wie het mag zien.
  const sent: { contacts: { companyName: string }[] }[] = [];
  const first = await rm.runReminders(now, async (d) => { sent.push(d); });
  assert.equal(first.contacts, 3);
  assert.equal(first.recipients, 1);
  assert.deepEqual(sent[0].contacts.map((c) => c.companyName).sort(), ["Hoofd oud", "Zilver oud", "Zonder vorm oud"]);
  assert.equal((await rm.runReminders(now, async () => assert.fail("mag niet opnieuw mailen"))).contacts, 0);
  // Na 30 dagen aanhoudende stilte volgt een nieuwe herinnering; de geplande afspraak van "Hoofd gepland" is dan
  // verstreken zonder vastgelegd contact, dus die sponsor komt nu ook in beeld.
  const later = new Date(now.getTime() + 31 * 86_400_000);
  assert.equal((await rm.runReminders(later, async () => {})).contacts, 4);
  // Een nieuw contactmoment haalt de sponsor van de lijst.
  await act(hoofdOud.id, daysAgo(1));
  assert.ok(!(await cmo.computeContactGaps(now)).some((g) => g.companyName === "Hoofd oud"));
  // Audit van de regels bevat de termijnen (geen bedragen aanwezig).
  assert.ok((await db.commercialAuditEvent.count({ where: { action: "contact_rules.update" } })) >= 2);
});
