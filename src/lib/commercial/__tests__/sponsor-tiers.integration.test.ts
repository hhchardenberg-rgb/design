// Integratietest sponsorvormen: koppelen, filteren, rapporteren, importeren en mailingdoelgroepen.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { parseTier, tierLabel } from "../sponsor-tiers";

test("sponsorvormen: herkennen van invoer en labels", () => {
  assert.equal(parseTier("Platina"), "PLATINA");
  assert.equal(parseTier(" hoofdsponsor "), "HOOFD");
  assert.equal(parseTier("ZILVER"), "ZILVER");
  assert.equal(parseTier("brons"), null);
  assert.equal(parseTier(""), null);
  assert.equal(tierLabel("GOUD"), "Goud");
  assert.equal(tierLabel(null), null);
});

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
let ml: typeof import("../mailings.server");
let im: typeof import("../import.server");

async function mkUser(key: string) {
  const u = await db.user.create({ data: { name: key, email: `${key}@tier.test`, passwordHash: "x", roles: ["HUB"] as never } });
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
  ml = await import("../mailings.server");
  im = await import("../import.server");
  for (const t of ["commercialMailEvent", "commercialUnsubscribe", "commercialMailingRecipient", "commercialMailing", "commercialIndexation", "commercialOpportunity", "commercialCounterpart", "commercialContract", "commercialPackageItem", "commercialPackage", "commercialSeason", "commercialFile", "commercialTask", "commercialActivity", "commercialContact", "commercialCompany", "commercialTeam", "commercialAuditEvent", "commercialMembership", "commercialRole"] as const) {
    await (db[t] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await db.user.deleteMany({ where: { email: { endsWith: "@tier.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (!skip) await db.$disconnect();
});

test("sponsorvormen koppelen, filteren, rapporteren, importeren en mailen", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await svc.buildActor({ ...(await mkUser("adm")), roles: ["ADMIN", "HUB"] });
  const mgr = await mkUser("mgr");
  await svc.grantMembership(admin, mgr.id, await role("beheerder"));
  const cm = await ctxMod.buildRecordCtx(mgr);

  // Koppelen en valideren.
  const a = await co.createCompany(cm, { name: "Smit", sponsorTier: "HOOFD" });
  const b = await co.createCompany(cm, { name: "Bakker", sponsorTier: "ZILVER" });
  const c = await co.createCompany(cm, { name: "Zonder" });
  const d = await co.createCompany(cm, { name: "Dekker", sponsorTier: "OVERIG" });
  await rejects(co.createCompany(cm, { name: "Fout", sponsorTier: "BRONS" }), 400);
  assert.equal((await co.getCompany(cm, a.id)).sponsorTier, "HOOFD");
  await co.updateCompany(cm, b.id, { version: 1, sponsorTier: "GOUD" });
  assert.equal((await co.getCompany(cm, b.id)).sponsorTier, "GOUD");
  await co.updateCompany(cm, d.id, { version: 1, sponsorTier: null });
  assert.equal((await co.getCompany(cm, d.id)).sponsorTier, null);
  await rejects(co.updateCompany(cm, d.id, { version: 2, sponsorTier: "PAARS" }), 400);

  // Filteren in het overzicht.
  const names = async (tiers: string[]) => (await co.listCompanies(cm, { tiers })).rows.map((r) => r.name).sort();
  assert.deepEqual(await names(["HOOFD"]), ["Smit"]);
  assert.deepEqual(await names(["HOOFD", "GOUD"]), ["Bakker", "Smit"]);
  assert.deepEqual(await names(["NONE"]), ["Dekker", "Zonder"]);
  assert.deepEqual(await names(["HOOFD", "NONE"]), ["Dekker", "Smit", "Zonder"]);
  assert.equal((await co.listCompanies(cm, {})).total, 4);
  assert.equal((await co.listCompanies(cm, { tiers: ["HOOFD"] })).rows[0].sponsorTier, "HOOFD");

  // Contracten en rapportage per sponsorvorm.
  const season = await ct.saveSeason(cm, null, { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30", status: "ACTIVE" });
  const pkg = await ct.savePackage(cm, null, { name: "Pakket", items: [{ title: "Bord" }] });
  for (const [comp, cents] of [[a, 500_000], [b, 200_000], [c, 50_000]] as const) {
    const id = await ct.createContract(cm, comp.id, { seasonId: season, packageId: pkg, startsOn: "2026-07-01", endsOn: "2027-06-30", amountCents: cents });
    await ct.setContractStatus(cm, id, "ACTIVE");
  }
  const onlyGold = await ct.listContracts(cm, { tiers: ["GOUD"] });
  assert.deepEqual(onlyGold.rows.map((r) => r.companyName), ["Bakker"]);
  assert.equal(onlyGold.rows[0].sponsorTier, "GOUD");
  assert.equal((await ct.listContracts(cm, {})).total, 3);
  const report = await rp.seasonReport(cm, season);
  assert.deepEqual(report.byTier.map((t) => [t.key, t.count, t.totalCents]), [["HOOFD", 1, 500_000], ["GOUD", 1, 200_000], ["NONE", 1, 50_000]]);
  assert.match(await rp.exportCompaniesCsv(cm), /Sponsorvorm/);
  assert.match(await rp.exportContractsCsv(cm), /Hoofd/);

  // Importeren: vorm uit het bestand; onbekende vorm wordt per rij gemeld.
  const dry = await im.importCompanies(cm, [{ name: "Import A", sponsorTier: "platina" }, { name: "Import B", sponsorTier: "brons" }], false);
  const out = dry as unknown as { results: { outcome: string }[] };
  assert.deepEqual(out.results.map((r) => r.outcome), ["ok", "invalid"]);
  assert.equal((await db.commercialCompany.findFirstOrThrow({ where: { name: "Import A" } })).sponsorTier, "PLATINA");

  // Mailing per sponsorvorm.
  for (const [comp, email] of [[a, "a@smit.nl"], [b, "b@bakker.nl"], [c, "c@zonder.nl"]] as const) await co.createContact(cm, comp.id, { name: "Contact", email });
  await rejects(ml.createMailing(cm, { subject: "S", bodyText: "B", audienceTiers: ["BRONS"] }), 400);
  const m1 = await ml.createMailing(cm, { subject: "Voor hoofd en goud", bodyText: "Hallo", audienceTiers: ["HOOFD", "GOUD", "HOOFD"] });
  assert.deepEqual((await ml.getMailing(cm, m1)).audienceTiers, ["HOOFD", "GOUD"]);
  const prep = await ml.prepareRecipients(cm, m1);
  assert.equal(prep.recipients, 2);
  assert.deepEqual((await ml.getMailing(cm, m1)).recipients.map((r) => r.email).sort(), ["a@smit.nl", "b@bakker.nl"]);
  const m2 = await ml.createMailing(cm, { subject: "Iedereen", bodyText: "Hallo" });
  assert.equal((await ml.prepareRecipients(cm, m2)).recipients, 3);
  assert.deepEqual((await ml.listMailings(cm)).find((x) => x.id === m1)!.audienceTiers, ["HOOFD", "GOUD"]);
});
