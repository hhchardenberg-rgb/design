// Integratietest meldingen bij een nieuw sponsorcontract. Er wordt nooit echt gemaild: de verzendfunctie wordt vervangen.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { renderContractNotice } from "../mail-render";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

test("meldingsmail: datums dd/mm/jjjj, geen bedragen, ontsnapte html", () => {
  const m = renderContractNotice({ companyName: "Bakker <b>&</b> Zn", tier: "Goud", season: "Aankomend seizoen", packageName: "Gouden pakket", startsOn: "01/07/2027", endsOn: "30/06/2028", actorName: "Piet", url: "https://hub.example/x" });
  assert.equal(m.subject, "Nieuw sponsorcontract: Bakker <b>&</b> Zn");
  assert.ok(m.html.includes("Bakker &lt;b&gt;&amp;&lt;/b&gt; Zn"));
  assert.ok(m.text.includes("Looptijd: 01/07/2027 t/m 30/06/2028"));
  assert.ok(m.text.includes("Seizoen: Aankomend seizoen"));
  assert.ok(!/€|bedrag/i.test(m.text));
});

let db: typeof import("@/lib/prisma").prisma;
let svc: typeof import("../service.server");
let authz: typeof import("../authz.server");
let ctxMod: typeof import("../ctx.server");
let co: typeof import("../companies.server");
let ct: typeof import("../contracts.server");
let nt: typeof import("../notifications.server");

async function mkUser(key: string) {
  const u = await db.user.create({ data: { name: key, email: `${key}@ntf.test`, passwordHash: "x", roles: ["HUB"] as never } });
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
  nt = await import("../notifications.server");
  for (const t of ["commercialNotificationLog", "commercialNotificationRecipient", "commercialIndexation", "commercialOpportunity", "commercialCounterpart", "commercialContract", "commercialPackageItem", "commercialPackage", "commercialSeason", "commercialFile", "commercialTask", "commercialActivity", "commercialContact", "commercialCompany", "commercialTeam", "commercialAuditEvent", "commercialMembership", "commercialRole"] as const) {
    await (db[t] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await db.user.deleteMany({ where: { email: { endsWith: "@ntf.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (!skip) await db.$disconnect();
});

test("melding nieuw contract: alleen beheerders wijzen aan, eenmalig per adres, nooit mailen buiten productie", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await svc.buildActor({ ...(await mkUser("adm")), roles: ["ADMIN", "HUB"] });
  const [mgr, lid, bestuur] = [await mkUser("mgr"), await mkUser("lid"), await mkUser("bestuur")];
  await svc.grantMembership(admin, mgr.id, await role("beheerder"));
  await svc.grantMembership(admin, lid.id, await role("sponsorcommissielid"));
  const cm = await ctxMod.buildRecordCtx(mgr);
  const cl = await ctxMod.buildRecordCtx(lid);

  // Aanwijzen: alleen met beheerbevoegdheid; geldig adres; geen dubbelen.
  await rejects(nt.addNotificationRecipient(cl, { email: "a@b.nl" }), 403);
  await rejects(nt.addNotificationRecipient(cm, { email: "geen-adres" }), 400);
  await nt.addNotificationRecipient(cm, { userId: bestuur.id });
  await nt.addNotificationRecipient(cm, { email: "Voorzitter@Club.nl", name: "Voorzitter" });
  await rejects(nt.addNotificationRecipient(cm, { email: "voorzitter@club.nl" }), 409);
  const list = await nt.listNotificationRecipients(cm);
  assert.equal(list.recipients.length, 2);
  assert.ok(!list.candidates.some((c) => c.id === bestuur.id), "al gekozen gebruikers staan niet meer in de keuzelijst");
  assert.equal(list.live, false, "testomgeving is geen productie");

  const s = await ct.saveSeason(cm, null, { name: "2027/2028", startsOn: "2027-07-01", endsOn: "2028-06-30", status: "ACTIVE" });
  const pkg = await ct.savePackage(cm, null, { name: "Gouden pakket", defaultAmountCents: 100_000, items: [{ title: "Bord" }] });
  const company = await co.createCompany(cm, { name: "Bakker en Zn", sponsorTier: "GOUD" });
  const id = await ct.createContract(cm, company.id, { seasonId: s, packageId: pkg, startsOn: "2027-07-01", endsOn: "2028-06-30", amountCents: 100_000 });

  const sent: { to: string; notice: Parameters<import("../notifications.server").ContractNoticeSender>[1] }[] = [];
  const send: import("../notifications.server").ContractNoticeSender = async (to, notice) => { sent.push({ to, notice }); };

  // Concept: geen melding.
  assert.equal((await nt.notifyContractActivated(id, mgr.id, send, { live: true })).recipients, 0);

  // Buiten productie: vastgelegd als overgeslagen, niets verstuurd.
  await ct.setContractStatus(cm, id, "ACTIVE");
  const preview = await nt.notifyContractActivated(id, mgr.id, send);
  assert.deepEqual({ ...preview }, { recipients: 2, sent: 0, failed: 0, skipped: 2, live: false });
  assert.equal(sent.length, 0);

  // Productie (tweede contract): beide adressen één keer, met de juiste inhoud en zonder bedrag.
  const company2 = await co.createCompany(cm, { name: "Smit Installatie" });
  const id2 = await ct.createContract(cm, company2.id, { seasonId: s, packageId: pkg, startsOn: "2027-07-01", endsOn: "2028-06-30", amountCents: 100_000 });
  await ct.setContractStatus(cm, id2, "ACTIVE");
  const live = await nt.notifyContractActivated(id2, mgr.id, send, { live: true });
  assert.deepEqual({ ...live }, { recipients: 2, sent: 2, failed: 0, skipped: 0, live: true });
  assert.deepEqual(sent.map((x) => x.to).sort(), ["bestuur@ntf.test", "voorzitter@club.nl"]);
  assert.equal(sent[0].notice.companyName, "Smit Installatie");
  assert.equal(sent[0].notice.startsOn, "01/07/2027");
  assert.equal(sent[0].notice.packageName, "Gouden pakket");
  assert.equal(sent[0].notice.actorName, "mgr");
  assert.ok(["Aankomend seizoen", "Huidig seizoen", "Afgelopen seizoen"].includes(sent[0].notice.season));
  assert.ok(!JSON.stringify(sent).includes("100000"));
  // Nogmaals melden doet niets.
  assert.equal((await nt.notifyContractActivated(id2, mgr.id, send, { live: true })).sent, 0);
  assert.equal(sent.length, 2);

  // Een mislukte verzending houdt niets tegen en wordt vastgelegd.
  const company3 = await co.createCompany(cm, { name: "Visser" });
  const id3 = await ct.createContract(cm, company3.id, { seasonId: s, packageId: pkg, startsOn: "2027-07-01", endsOn: "2028-06-30" });
  await ct.setContractStatus(cm, id3, "ACTIVE");
  const failed = await nt.notifyContractActivated(id3, mgr.id, async () => { throw new Error("Resend weigerde"); }, { live: true });
  assert.equal(failed.failed, 2);
  assert.equal(await db.commercialNotificationLog.count({ where: { refId: id3, status: "FAILED" } }), 2);

  // Verwijderen: alleen beheerders.
  const rec = (await nt.listNotificationRecipients(cm)).recipients[0];
  await rejects(nt.removeNotificationRecipient(cl, rec.id), 403);
  await nt.removeNotificationRecipient(cm, rec.id);
  assert.equal((await nt.listNotificationRecipients(cm)).recipients.length, 1);
});
