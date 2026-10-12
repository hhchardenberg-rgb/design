// Integratietest seizoenen, pakketten, contracten en tegenprestaties. Overgeslagen zonder TEST_DATABASE_URL.
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

async function mkUser(key: string, roles: string[] = ["HUB"]) {
  const u = await db.user.create({ data: { name: key, email: `${key}@ctr.test`, passwordHash: "x", roles: roles as never } });
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
  ct = await import("../contracts.server");
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
  await db.user.deleteMany({ where: { email: { endsWith: "@ctr.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (skip) return;
  await db.commercialOpportunity.deleteMany();
  await db.commercialCounterpart.deleteMany();
  await db.commercialContract.deleteMany();
  await db.$disconnect();
});

test("contracten: momentopname, bedragenrechten, statusregels, verlenging, bereik", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await svc.buildActor({ ...(await mkUser("adm")), roles: ["ADMIN", "HUB"] });
  const [mgr, cb, lid, own] = [await mkUser("mgr"), await mkUser("cb"), await mkUser("lid"), await mkUser("own")];
  await svc.grantMembership(admin, mgr.id, await role("beheerder"));
  await svc.grantMembership(admin, cb.id, await role("contractbeheerder")); // bewerkt contracten en bedragen, mag niet goedkeuren
  await svc.grantMembership(admin, lid.id, await role("sponsorcommissielid")); // leest contracten, geen bedragen
  await svc.grantMembership(admin, own.id, await role("beheerder"));
  await svc.setMemberScopes(await svc.buildActor(mgr), own.id, { companies: "OWN" });
  const cm = await ctxMod.buildRecordCtx(mgr);
  const cc = await ctxMod.buildRecordCtx(cb);
  const cl = await ctxMod.buildRecordCtx(lid);
  const cown = await ctxMod.buildRecordCtx(own);

  // Instellingen: alleen met beheerbevoegdheid.
  await rejects(ct.saveSeason(cc, null, { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30" }), 403);
  const s1 = await ct.saveSeason(cm, null, { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30", status: "ACTIVE" });
  const s2 = await ct.saveSeason(cm, null, { name: "2027/2028", startsOn: "2027-07-01", endsOn: "2028-06-30" });
  await rejects(ct.saveSeason(cm, null, { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30" }), 409);
  await rejects(ct.saveSeason(cm, null, { name: "Fout", startsOn: "2027-07-01", endsOn: "2026-07-01" }), 400);
  const pkg = await ct.savePackage(cm, null, { name: "Gouden pakket", defaultAmountCents: 250_000, items: [{ title: "Reclamebord", quantity: 2 }, { title: "Vermelding website" }] });
  const pkgList = await ct.listPackages(cl);
  assert.equal(pkgList[0].defaultAmountCents, null, "lid ziet geen standaardbedrag");
  assert.equal((await ct.listPackages(cm))[0].defaultAmountCents, 250_000);

  const company = await co.createCompany(cm, { name: "Jansen Bouw" });
  await rejects(ct.createContract(cl, company.id, { seasonId: s1, packageId: pkg, startsOn: "2026-07-01", endsOn: "2027-06-30" }), 403);
  await rejects(ct.createContract(cc, company.id, { seasonId: s1, packageId: pkg, startsOn: "2027-07-01", endsOn: "2026-06-30" }), 400);

  // Contractbeheerder maakt concept met bedrag; momentopname en tegenprestaties ontstaan.
  const id = await ct.createContract(cc, company.id, { seasonId: s1, packageId: pkg, startsOn: "2026-07-01", endsOn: "2027-06-30", amountCents: 240_000, noticeUntil: "2027-04-01" });
  let c = await ct.getContract(cm, id);
  assert.equal(c.status, "DRAFT");
  assert.equal(c.amountCents, 240_000);
  assert.equal((c.packageSnapshot as { items: unknown[] }).items.length, 2);
  assert.equal(JSON.stringify(c.packageSnapshot).includes("250000"), false, "momentopname bevat geen bedragen");
  assert.equal((await ct.listCounterparts(cm, id)).length, 2);

  // Zonder bedragenrechten geen bedrag, ook niet in lijsten.
  assert.equal((await ct.getContract(cl, id)).amountCents, null);
  assert.equal((await ct.listContracts(cl, {})).rows[0].amountCents, null);
  await rejects(ct.updateContract(cl, id, { version: c.version, notes: "x" }), 403);

  // Latere pakketwijziging verandert de momentopname niet.
  await ct.savePackage(cm, pkg, { name: "Gouden pakket", items: [{ title: "Alleen dit nog" }] });
  c = await ct.getContract(cm, id);
  assert.equal((c.packageSnapshot as { items: unknown[] }).items.length, 2);

  // Bijwerken: versiecontrole en bedragenrecht.
  await ct.updateContract(cc, id, { version: c.version, notes: "Gesproken op 1 oktober" });
  await rejects(ct.updateContract(cc, id, { version: c.version, notes: "verouderd" }), 409);
  c = await ct.getContract(cm, id);

  // Activeren vereist 'goedkeuren'.
  await rejects(ct.setContractStatus(cc, id, "ACTIVE"), 403);
  c = await ct.setContractStatus(cm, id, "ACTIVE");
  assert.equal(c.status, "ACTIVE");
  await rejects(ct.setContractStatus(cm, id, "DRAFT" as never), 409);
  // Lopend: pakket en seizoen staan vast, bedrag kan met recht wel (en zonder recht niet).
  await rejects(ct.updateContract(cm, id, { version: c.version, seasonId: s2 }), 409);
  await rejects(ct.updateContract(cm, id, { version: c.version, packageId: null }), 409);
  await ct.updateContract(cc, id, { version: c.version, amountCents: 245_000 });
  assert.equal((await ct.getContract(cm, id)).amountCents, 245_000);
  const auditAfter = await db.commercialAuditEvent.findMany({ where: { entity: "contract", entityId: id } });
  assert.equal(JSON.stringify(auditAfter).includes("245000"), false, "bedragen staan niet in het auditlog");

  // Tegenprestaties: voortgang bijhouden.
  const [cp1] = await ct.listCounterparts(cm, id);
  await ct.updateCounterpart(cm, cp1.id, { status: "DELIVERED" });
  assert.ok((await ct.listCounterparts(cm, id)).find((x) => x.id === cp1.id)!.deliveredAt);
  await ct.addCounterpart(cm, id, { title: "Extra: banner bij toernooi", dueOn: "2026-09-15" });
  assert.equal((await ct.listCounterparts(cm, id)).length, 3);
  await rejects(ct.updateCounterpart(cl, cp1.id, { status: "PLANNED" }), 403);

  // Verlenging: nieuw concept, pakket opnieuw vastgelegd, niet twee keer.
  const renewed = await ct.renewContract(cm, id, { seasonId: s2, startsOn: "2027-07-01", endsOn: "2028-06-30" });
  const r = await ct.getContract(cm, renewed);
  assert.equal(r.status, "DRAFT");
  assert.equal(r.renewedFromId, id);
  assert.equal(r.amountCents, 245_000);
  assert.equal((r.packageSnapshot as { items: unknown[] }).items.length, 1); // actueel pakket
  await rejects(ct.renewContract(cm, id, { seasonId: s2, startsOn: "2027-07-01", endsOn: "2028-06-30" }), 409);

  // Aflopende contracten.
  const soon = await ct.listContracts(cm, { expiringWithinDays: 4000 });
  assert.ok(soon.rows.some((x) => x.id === id));

  // Bereik: 'own' ziet het dossier van mgr niet, dus ook geen contracten.
  assert.equal((await ct.listContracts(cown, {})).total, 0);
  await rejects(ct.getContract(cown, id), 404);
  await rejects(ct.listContracts(cown, { companyId: company.id }), 404);

  // Annuleren stopt openstaande tegenprestaties.
  c = await ct.getContract(cm, renewed);
  await ct.setContractStatus(cm, renewed, "CANCELLED");
  assert.ok((await ct.listCounterparts(cm, renewed)).every((x) => x.status === "CANCELLED"));
  await rejects(ct.updateContract(cm, renewed, { version: c.version + 1, notes: "x" }), 409);
});
