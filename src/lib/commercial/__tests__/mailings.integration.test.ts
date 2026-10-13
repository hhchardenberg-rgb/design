// Integratietest mailings, afmelden en webhooks. Er wordt nooit echt gemaild: de verzendfunctie is een stand-in.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.AUTH_SECRET ??= "testsecret";
import { readUnsubscribeParams, unsubscribeParams, verifyWebhookSignature } from "../mail-security";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

test("afmeldlink: ondertekend en niet te vervalsen", () => {
  const { e, t } = unsubscribeParams("Piet@Voorbeeld.NL");
  assert.equal(readUnsubscribeParams(e, t), "piet@voorbeeld.nl");
  assert.equal(readUnsubscribeParams(e, t + "x"), null);
  const other = unsubscribeParams("ander@voorbeeld.nl");
  assert.equal(readUnsubscribeParams(e, other.t), null);
  assert.equal(readUnsubscribeParams(null, t), null);
});

test("webhook-handtekening (Svix): geldig, gemanipuleerd en verouderd", () => {
  const key = Buffer.from("geheime-sleutel-voor-test");
  const secret = `whsec_${key.toString("base64")}`;
  const now = new Date("2026-10-13T10:00:00Z");
  const ts = String(Math.floor(now.getTime() / 1000));
  const body = JSON.stringify({ type: "email.delivered" });
  const sig = `v1,${createHmac("sha256", key).update(`msg_1.${ts}.${body}`).digest("base64")}`;
  const base = { secret, id: "msg_1", timestamp: ts, signature: sig, body, now };
  assert.equal(verifyWebhookSignature(base), true);
  assert.equal(verifyWebhookSignature({ ...base, signature: `v1,AAAA ${sig}` }), true);
  assert.equal(verifyWebhookSignature({ ...base, body: body + " " }), false);
  assert.equal(verifyWebhookSignature({ ...base, id: "msg_2" }), false);
  assert.equal(verifyWebhookSignature({ ...base, now: new Date(now.getTime() + 10 * 60_000) }), false);
  assert.equal(verifyWebhookSignature({ ...base, signature: null }), false);
});

let db: typeof import("@/lib/prisma").prisma;
let svc: typeof import("../service.server");
let authz: typeof import("../authz.server");
let ctxMod: typeof import("../ctx.server");
let co: typeof import("../companies.server");
let ml: typeof import("../mailings.server");

async function mkUser(key: string) {
  const u = await db.user.create({ data: { name: key, email: `${key}@mail.test`, passwordHash: "x", roles: ["HUB"] as never } });
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
  ml = await import("../mailings.server");
  for (const t of ["commercialMailEvent", "commercialUnsubscribe", "commercialMailingRecipient", "commercialMailing", "commercialReminderLog", "commercialIndexation", "commercialOpportunity", "commercialCounterpart", "commercialContract", "commercialPackageItem", "commercialPackage", "commercialSeason", "commercialFile", "commercialTask", "commercialActivity", "commercialContact", "commercialCompany", "commercialTeam", "commercialAuditEvent", "commercialMembership", "commercialRole"] as const) {
    await (db[t] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await db.user.deleteMany({ where: { email: { endsWith: "@mail.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (!skip) await db.$disconnect();
});

test("mailing: doelgroep, bereik, afmelden, eenmalig versturen, fouten en webhooks", { skip }, async () => {
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

  const a = await co.createCompany(cm, { name: "Smit" });
  const b = await co.createCompany(cm, { name: "Bakkerij" });
  const arch = await co.createCompany(cm, { name: "Oud" });
  await co.createContact(cm, a.id, { name: "Anna", email: "Anna@Smit.nl" });
  await co.createContact(cm, a.id, { name: "Anna dubbel", email: "anna@smit.nl" });
  await co.createContact(cm, a.id, { name: "Kapot", email: "geen-adres" });
  await co.createContact(cm, a.id, { name: "Zonder" });
  await co.createContact(cm, b.id, { name: "Bert", email: "bert@bakker.nl" });
  await co.createContact(cm, b.id, { name: "Afgemeld", email: "weg@bakker.nl" });
  await co.createContact(cm, arch.id, { name: "Oudje", email: "oud@oud.nl" });
  await co.setCompanyArchived(cm, arch.id, true);
  await ml.recordUnsubscribe("WEG@bakker.nl", "LINK");

  // Rechten.
  await rejects(ml.createMailing(cl, { subject: "x", bodyText: "y" }), 403);
  await rejects(ml.createMailing(cm, { subject: " ", bodyText: "y" }), 400);
  const id = await ml.createMailing(cm, { subject: "Seizoenstart", bodyText: "Hallo {{naam}},\n\nTot snel." });

  // Voorbereiden: geldig, uniek, niet afgemeld, niet gearchiveerd.
  const prep = await ml.prepareRecipients(cm, id);
  assert.equal(prep.recipients, 2);
  assert.deepEqual(prep.skipped, { invalid: 1, unsubscribed: 1, duplicates: 1 });
  // Bereik 'eigen': eigenaar ziet niets van andermans dossiers, dus geen ontvangers (en zijn tellingen lekken niets).
  const idOwn = await ml.createMailing(cown, { subject: "Eigen", bodyText: "x" });
  assert.equal((await ml.prepareRecipients(cown, idOwn)).recipients, 0);
  assert.equal((await ml.getMailing(cown, id)).recipients.length, 0);
  assert.equal((await ml.getMailing(cm, id)).recipients.length, 2);
  await rejects(ml.sendMailing(cown, idOwn, async () => ({ providerMessageId: null })), 409); // geen ontvangers
  await rejects(ml.sendMailing(cl, id, async () => ({ providerMessageId: null })), 403);

  // Afmelden tussen voorbereiden en verzenden wordt alsnog gerespecteerd; één mislukte verzending stopt de rest niet.
  await ml.recordUnsubscribe("bert@bakker.nl", "LINK");
  const sentTo: string[] = [];
  const first = await ml.sendMailing(cm, id, async (m) => {
    sentTo.push(m.to);
    return { providerMessageId: "prov-1" };
  });
  assert.deepEqual(first, { sent: 1, failed: 0, skipped: 1 });
  assert.deepEqual(sentTo, ["anna@smit.nl"]);
  assert.equal((await db.commercialMailing.findUniqueOrThrow({ where: { id } })).status, "SENT");
  await rejects(ml.sendMailing(cm, id, async () => assert.fail("nooit tweemaal")), 409);
  await rejects(ml.updateMailing(cm, id, { subject: "x", bodyText: "y", version: 99 }), 409);

  // Fout bij verzenden: gemarkeerd, de rest gaat door, en opnieuw proberen verstuurt alleen de mislukte.
  await db.commercialUnsubscribe.deleteMany();
  const id2 = await ml.createMailing(cm, { subject: "Tweede", bodyText: "x" });
  await ml.prepareRecipients(cm, id2);
  const r2 = await ml.sendMailing(cm, id2, async (m) => {
    if (m.to === "anna@smit.nl") throw new Error("Resend weigerde");
    return { providerMessageId: `p2-${m.to}` };
  });
  assert.deepEqual(r2, { sent: 2, failed: 1, skipped: 0 });
  assert.equal((await db.commercialMailing.findUniqueOrThrow({ where: { id: id2 } })).status, "SENT");
  assert.equal((await ml.retryFailed(cm, id2)).requeued, 1);
  const again: string[] = [];
  await ml.sendMailing(cm, id2, async (m) => { again.push(m.to); return { providerMessageId: "p3-anna" }; });
  assert.deepEqual(again, ["anna@smit.nl"]);

  // Webhooks: idempotent; delivered, harde bounce meldt af, klacht meldt af.
  assert.deepEqual(await ml.applyMailEvent("evt1", { type: "email.delivered", data: { email_id: "p2-bert@bakker.nl" } }), { duplicate: false, matched: 1 });
  assert.deepEqual(await ml.applyMailEvent("evt1", { type: "email.delivered", data: { email_id: "p2-bert@bakker.nl" } }), { duplicate: true });
  await ml.applyMailEvent("evt2", { type: "email.bounced", data: { email_id: "p2-bert@bakker.nl", bounce: { type: "Permanent" } } });
  assert.ok(await db.commercialUnsubscribe.findUnique({ where: { email: "bert@bakker.nl" } }));
  await ml.applyMailEvent("evt3", { type: "email.delivered", data: { email_id: "p2-bert@bakker.nl" } }); // te laat: overschrijft de bounce niet
  assert.equal((await db.commercialMailingRecipient.findFirstOrThrow({ where: { providerMessageId: "p2-bert@bakker.nl" } })).status, "BOUNCED");
  await ml.applyMailEvent("evt4", { type: "email.complained", data: { email_id: "p3-anna" } });
  assert.ok(await db.commercialUnsubscribe.findUnique({ where: { email: "anna@smit.nl" } }));

  // Auditlog bevat aantallen, nooit adressen of tekst.
  const events = JSON.stringify(await db.commercialAuditEvent.findMany({ where: { action: { startsWith: "mailing." } } }));
  assert.ok(!events.includes("smit.nl") && !events.includes("Hallo"));
});
