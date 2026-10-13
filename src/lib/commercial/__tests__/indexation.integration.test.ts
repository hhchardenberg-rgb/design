// Integratietest indexatie van verlengingen. Overgeslagen zonder TEST_DATABASE_URL.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { indexedAmount } from "../indexation.server";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

let db: typeof import("@/lib/prisma").prisma;
let svc: typeof import("../service.server");
let authz: typeof import("../authz.server");
let ctxMod: typeof import("../ctx.server");
let co: typeof import("../companies.server");
let ct: typeof import("../contracts.server");
let ix: typeof import("../indexation.server");

async function mkUser(key: string) {
  const u = await db.user.create({ data: { name: key, email: `${key}@idx.test`, passwordHash: "x", roles: ["HUB"] as never } });
  return { id: u.id, name: key, email: u.email, roles: ["HUB"] };
}
async function rejects(p: Promise<unknown>, status: number) {
  await assert.rejects(p, (e: { status?: number }) => e.status === status);
}

test("indexatiebedrag: percentage en afronding", () => {
  assert.equal(indexedAmount(250_000, 300, 100), 257_500);
  assert.equal(indexedAmount(100_050, 350, 100), 103_600); // 1035,5175 -> 1036
  assert.equal(indexedAmount(100_050, 350, 1000), 104_000); // 1035,52 op 10 euro -> 1040
  assert.equal(indexedAmount(100_000, 0, 100), 100_000);
  assert.equal(indexedAmount(100_000, -1000, 100), 90_000);
});

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../service.server");
  authz = await import("../authz.server");
  ctxMod = await import("../ctx.server");
  co = await import("../companies.server");
  ct = await import("../contracts.server");
  ix = await import("../indexation.server");
  await db.commercialIndexation.deleteMany();
  await db.commercialOpportunity.deleteMany();
  await db.commercialCounterpart.deleteMany();
  await db.commercialContract.deleteMany();
  await db.commercialPackageItem.deleteMany();
  await db.commercialPackage.deleteMany();
  await db.commercialSeason.deleteMany();
  await db.commercialFile.deleteMany();
  await db.commercialTask.deleteMany();
  await db.commercialActivity.deleteMany();
  await db.commercialContact.deleteMany();
  await db.commercialCompany.deleteMany();
  await db.commercialTeam.deleteMany();
  await db.commercialAuditEvent.deleteMany();
  await db.commercialMembership.deleteMany();
  await db.commercialRole.deleteMany();
  await db.user.deleteMany({ where: { email: { endsWith: "@idx.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (skip) return;
  await db.commercialIndexation.deleteMany();
  await db.commercialCounterpart.deleteMany();
  await db.commercialContract.deleteMany();
  await db.$disconnect();
});

test("indexatie: voorbeeld, toepassen, eenmalig, rechten en geen bedragen in auditlog", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await svc.buildActor({ ...(await mkUser("adm")), roles: ["ADMIN", "HUB"] });
  const [mgr, cb, lid] = [await mkUser("mgr"), await mkUser("cb"), await mkUser("lid")];
  await svc.grantMembership(admin, mgr.id, await role("beheerder"));
  await svc.grantMembership(admin, cb.id, await role("contractbeheerder")); // bedragen bewerken, niet goedkeuren
  await svc.grantMembership(admin, lid.id, await role("sponsorcommissielid")); // geen bedragen
  const cm = await ctxMod.buildRecordCtx(mgr);
  const cc = await ctxMod.buildRecordCtx(cb);
  const cl = await ctxMod.buildRecordCtx(lid);

  const s1 = await ct.saveSeason(cm, null, { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30", status: "ACTIVE" });
  const s2 = await ct.saveSeason(cm, null, { name: "2027/2028", startsOn: "2027-07-01", endsOn: "2028-06-30" });
  const pkg = await ct.savePackage(cm, null, { name: "Brons", items: [{ title: "Bord" }] });
  const mk = async (name: string, amount: number | null) => {
    const c = await co.createCompany(cm, { name });
    const id = await ct.createContract(cm, c.id, { seasonId: s1, packageId: pkg, startsOn: "2026-07-01", endsOn: "2027-06-30", ...(amount != null ? { amountCents: amount } : {}) });
    await ct.setContractStatus(cm, id, "ACTIVE");
    const renewed = await ct.renewContract(cm, id, { seasonId: s2, startsOn: "2027-07-01", endsOn: "2028-06-30" });
    return { id, renewed };
  };
  const a = await mk("Sponsor A", 100_000);
  const b = await mk("Sponsor B", 250_050);
  const zonder = await mk("Sponsor C", null); // voorgaand contract zonder bedrag

  // Rechten.
  await rejects(ix.previewIndexation(cl, { seasonId: s2, basisPoints: 300, roundingCents: 100 }), 403);
  await rejects(ix.applyIndexation(cc, { seasonId: s2, basisPoints: 300, roundingCents: 100 }), 403); // mag bedragen bewerken, niet goedkeuren
  await rejects(ix.previewIndexation(cm, { seasonId: s2, basisPoints: 9000, roundingCents: 100 }), 400);
  await rejects(ix.previewIndexation(cm, { seasonId: s2, basisPoints: 300, roundingCents: 7 }), 400);

  // Voorbeeld wijzigt niets.
  const pv = await ix.previewIndexation(cm, { seasonId: s2, basisPoints: 300, roundingCents: 100 });
  assert.equal(pv.items.length, 3);
  assert.equal(pv.skippedWithoutBase, 1);
  assert.equal(pv.items.find((i) => i.contractId === a.renewed)!.newCents, 103_000);
  assert.equal(pv.items.find((i) => i.contractId === b.renewed)!.newCents, 257_600); // 2575,515 -> 2576
  assert.equal((await ct.getContract(cm, a.renewed)).amountCents, 100_000); // verlenging nam het oude bedrag over

  // Toepassen.
  const res = await ix.applyIndexation(cm, { seasonId: s2, basisPoints: 300, roundingCents: 100 });
  assert.equal(res.contracts, 2);
  assert.equal((await ct.getContract(cm, a.renewed)).amountCents, 103_000);
  assert.equal((await ct.getContract(cm, b.renewed)).amountCents, 257_600);
  assert.equal((await ct.getContract(cm, zonder.renewed)).amountCents, null);
  assert.equal((await ct.getContract(cm, a.id)).amountCents, 100_000, "voorgaand contract blijft ongewijzigd");

  // Niet stapelen: een tweede ronde vindt niets meer.
  await rejects(ix.applyIndexation(cm, { seasonId: s2, basisPoints: 300, roundingCents: 100 }), 409);
  assert.equal((await ct.getContract(cm, a.renewed)).amountCents, 103_000);

  // Geschiedenis zonder bedragen; auditlog zonder bedragen.
  const runs = await ix.listIndexations(cm);
  assert.equal(runs[0].contracts, 2);
  assert.equal(runs[0].basisPoints, 300);
  const audit = await db.commercialAuditEvent.findMany({ where: { action: "indexation.apply" } });
  assert.equal(audit.length, 1);
  assert.equal(/103000|257600/.test(JSON.stringify(audit)), false);
  await rejects(ix.listIndexations(cl), 403);
});
