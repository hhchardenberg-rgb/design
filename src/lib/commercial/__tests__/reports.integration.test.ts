// Integratietest rapportages en exports. Overgeslagen zonder TEST_DATABASE_URL.
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
let rp: typeof import("../reports.server");

async function mkUser(key: string) {
  const u = await db.user.create({ data: { name: key, email: `${key}@rep.test`, passwordHash: "x", roles: ["HUB"] as never } });
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
  rp = await import("../reports.server");
  for (const t of ["commercialIndexation", "commercialOpportunity", "commercialCounterpart", "commercialContract", "commercialPackageItem", "commercialPackage", "commercialSeason", "commercialFile", "commercialTask", "commercialActivity", "commercialContact", "commercialCompany", "commercialTeam", "commercialAuditEvent", "commercialMembership", "commercialRole"] as const) {
    await (db[t] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await db.user.deleteMany({ where: { email: { endsWith: "@rep.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (skip) return;
  await db.commercialContract.deleteMany();
  await db.$disconnect();
});

test("rapportages en export: bedragen, bereik, formule-injectie en logging", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await svc.buildActor({ ...(await mkUser("adm")), roles: ["ADMIN", "HUB"] });
  const [mgr, lid, own] = [await mkUser("mgr"), await mkUser("lid"), await mkUser("own")];
  await svc.grantMembership(admin, mgr.id, await role("beheerder"));
  await svc.grantMembership(admin, lid.id, await role("alleen-lezen"));
  await svc.grantMembership(admin, own.id, await role("beheerder"));
  await svc.setMemberScopes(await svc.buildActor(mgr), own.id, { companies: "OWN" });
  const cm = await ctxMod.buildRecordCtx(mgr);
  const cl = await ctxMod.buildRecordCtx(lid);
  const cown = await ctxMod.buildRecordCtx(own);

  const season = await ct.saveSeason(cm, null, { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30", status: "ACTIVE" });
  const pkg = await ct.savePackage(cm, null, { name: "Zilver", items: [{ title: "Bord" }] });
  const a = await co.createCompany(cm, { name: "=HYPERLINK(\"http://x\")" });
  const b = await co.createCompany(cm, { name: "Bakkerij" });
  for (const [c, amount] of [[a.id, 100_000], [b.id, 250_000]] as const) {
    const id = await ct.createContract(cm, c, { seasonId: season, packageId: pkg, startsOn: "2026-07-01", endsOn: "2027-06-30", amountCents: amount });
    await ct.setContractStatus(cm, id, "ACTIVE");
  }

  // Bedragen met recht, zonder recht nergens (ook niet in totalen).
  const full = await rp.seasonReport(cm, season);
  assert.equal(full.byStatus.find((s) => s.status === "ACTIVE")!.totalCents, 350_000);
  assert.equal(full.byPackage[0].totalCents, 350_000);

  // Zonder rapportagerecht niets; met rapportage- maar zonder bedragenrecht zijn alle bedragen null (ook totalen).
  await rejects(rp.seasonReport(cl, season), 403);
  const noAmounts = await mkUser("noamt");
  const roleNoAmt = await svc.createRole(await svc.buildActor(mgr), { name: "Rapport zonder bedragen", permissions: ["companies:read", "contracts:read", "opportunities:read", "reports:read", "exports:export"] });
  await svc.grantMembership(admin, noAmounts.id, roleNoAmt.id);
  const cna = await ctxMod.buildRecordCtx(noAmounts);
  const hidden = await rp.seasonReport(cna, season);
  assert.equal(hidden.byStatus.find((s) => s.status === "ACTIVE")!.count, 2);
  assert.ok(hidden.byStatus.every((s) => s.totalCents === null) && hidden.byPackage.every((p) => p.totalCents === null) && hidden.activeWithoutAmount === null);
  assert.ok((await rp.pipelineReport(cna)).stages.every((s) => s.expectedCents === null));
  const hiddenCsv = await rp.exportContractsCsv(cna, season);
  assert.ok(!hiddenCsv.includes("Bedrag") && !hiddenCsv.includes("2500"));

  // Bereik: 'eigen' ziet alleen eigen dossiers, dus niets van bovenstaande.
  const scoped = await rp.seasonReport(cown, season);
  assert.equal(scoped.byStatus.find((s) => s.status === "ACTIVE")!.count, 0);
  await rejects(rp.seasonReport(cm, "bestaat-niet"), 404);

  // Export: eigen recht nodig, formule-injectie geneutraliseerd, bedragen alleen met recht, gelogd.
  await rejects(rp.exportContractsCsv(cl, season), 403);
  const csv = await rp.exportContractsCsv(cm, season);
  assert.ok(csv.includes("Bedrag (excl. btw)"));
  assert.ok(csv.includes("2500,00"));
  assert.ok(!csv.split("\r\n").some((l) => l.startsWith("=")));
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.equal((await rp.exportContractsCsv(cown, season)).split("\r\n").length, 2); // alleen kop
  const comp = await rp.exportCompaniesCsv(cm);
  assert.ok(comp.includes("Bakkerij"));
  assert.ok(!comp.includes("internalNotes"));
  const events = await db.commercialAuditEvent.findMany({ where: { action: { startsWith: "export." } } });
  assert.ok(events.length >= 3);
  assert.ok(!JSON.stringify(events).includes("350000") && !JSON.stringify(events).includes("2500"));
});
