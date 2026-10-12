// Integratietest pijplijn (acquisitiekansen). Overgeslagen zonder TEST_DATABASE_URL.
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

async function mkUser(key: string) {
  const u = await db.user.create({ data: { name: key, email: `${key}@opp.test`, passwordHash: "x", roles: ["HUB"] as never } });
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
  await db.user.deleteMany({ where: { email: { endsWith: "@opp.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (skip) return;
  await db.commercialIndexation.deleteMany();
  await db.commercialOpportunity.deleteMany();
  await db.commercialCounterpart.deleteMany();
  await db.commercialContract.deleteMany();
  await db.$disconnect();
});

test("pijplijn: fasen, verloren-reden, winnen naar contract, bedragen, bereik, samenvoegen", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await svc.buildActor({ ...(await mkUser("adm")), roles: ["ADMIN", "HUB"] });
  const [mgr, rel, lid, own] = [await mkUser("mgr"), await mkUser("rel"), await mkUser("lid"), await mkUser("own")];
  await svc.grantMembership(admin, mgr.id, await role("beheerder"));
  await svc.grantMembership(admin, rel.id, await role("relatiebeheerder")); // kansen bewerken, bedragen alleen lezen
  await svc.grantMembership(admin, lid.id, await role("alleen-lezen"));
  await svc.grantMembership(admin, own.id, await role("beheerder"));
  await svc.setMemberScopes(await svc.buildActor(mgr), own.id, { companies: "OWN" });
  const cm = await ctxMod.buildRecordCtx(mgr);
  const cr = await ctxMod.buildRecordCtx(rel);
  const cl = await ctxMod.buildRecordCtx(lid);
  const cown = await ctxMod.buildRecordCtx(own);

  const season = await ct.saveSeason(cm, null, { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30", status: "ACTIVE" });
  const pkg = await ct.savePackage(cm, null, { name: "Zilver", items: [{ title: "Reclamebord" }] });
  const company = await co.createCompany(cm, { name: "Smit Installatie" });

  // Aanmaken: rechten en bedragenrecht.
  await rejects(op.createOpportunity(cl, company.id, { title: "x" }), 403);
  await rejects(op.createOpportunity(cr, company.id, { title: "Met bedrag", expectedAmountCents: 100_000 }), 403); // relatiebeheerder mag bedragen niet wijzigen
  const id = await op.createOpportunity(cr, company.id, { title: "Zilveren pakket", packageId: pkg });
  const id2 = await op.createOpportunity(cm, company.id, { title: "Banner", expectedAmountCents: 50_000 });

  // Bedragen zichtbaar voor wie mag, totaal alleen dan.
  const asMgr = await op.listOpportunities(cm, {});
  assert.equal(asMgr.items.length, 2);
  assert.equal(asMgr.totalExpectedCents, 50_000);
  const asLid = await op.listOpportunities(cl, {});
  assert.equal(asLid.totalExpectedCents, null);
  assert.ok(asLid.items.every((i) => i.expectedAmountCents === null));

  // Fasen: verplaatsen, niet naar winnen via stage, verloren vraagt reden.
  await op.moveStage(cr, id, "CONTACTED");
  await op.moveStage(cr, id, "PROPOSAL");
  await rejects(op.moveStage(cr, id, "WON"), 400);
  await rejects(op.moveStage(cr, id, "LOST"), 400);
  await rejects(op.moveStage(cl, id, "NEGOTIATION"), 403);
  await op.moveStage(cr, id2, "LOST", "Geen budget dit jaar");
  await rejects(op.moveStage(cr, id2, "LEAD"), 409); // afgesloten
  assert.equal((await op.listOpportunities(cm, {})).items.length, 1);
  assert.equal((await op.listOpportunities(cm, { includeClosed: true })).items.length, 2);

  // Versiecontrole.
  const [cur] = (await op.listOpportunities(cm, {})).items;
  await op.updateOpportunity(cr, id, { version: cur.version, notes: "Terugbellen na de zomer" });
  await rejects(op.updateOpportunity(cr, id, { version: cur.version, notes: "verouderd" }), 409);

  // Winnen: mislukt contract laat de kans open, anders ontstaat een concept-contract met pakket.
  await rejects(op.convertToContract(cm, id, { seasonId: "bestaat-niet", startsOn: "2026-07-01", endsOn: "2027-06-30" }), 400);
  assert.equal((await op.listOpportunities(cm, {})).items[0].stage, "PROPOSAL");
  await rejects(op.convertToContract(cl, id, { seasonId: season, startsOn: "2026-07-01", endsOn: "2027-06-30" }), 403);
  // relatiebeheerder mag contracten niet aanmaken
  await rejects(op.convertToContract(cr, id, { seasonId: season, startsOn: "2026-07-01", endsOn: "2027-06-30" }), 403);
  const contractId = await op.convertToContract(cm, id, { seasonId: season, startsOn: "2026-07-01", endsOn: "2027-06-30" });
  const contract = await ct.getContract(cm, contractId);
  assert.equal(contract.status, "DRAFT");
  assert.equal(contract.packageId, pkg);
  const won = (await op.listOpportunities(cm, { includeClosed: true })).items.find((i) => i.id === id)!;
  assert.equal(won.stage, "WON");
  assert.equal(won.wonContractId, contractId);
  await rejects(op.convertToContract(cm, id, { seasonId: season, startsOn: "2026-07-01", endsOn: "2027-06-30" }), 409);

  // Bereik: 'own' ziet kansen van andermans dossiers niet.
  assert.equal((await op.listOpportunities(cown, { includeClosed: true })).items.length, 0);
  await rejects(op.createOpportunity(cown, company.id, { title: "x" }), 404);
  await rejects(op.moveStage(cown, id2, "LEAD"), 404);

  // Samenvoegen neemt kansen mee.
  const dup = await co.createCompany(cm, { name: "Smit Install." });
  const idDup = await op.createOpportunity(cm, dup.id, { title: "Los" });
  await co.mergeCompanies(cm, company.id, dup.id);
  assert.equal((await db.commercialOpportunity.findUniqueOrThrow({ where: { id: idDup } })).companyId, company.id);
});
