// Integratietest profiel: gegevens, voorkeuren en wachtwoord wijzigen. Overgeslagen zonder TEST_DATABASE_URL.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

let db: typeof import("@/lib/prisma").prisma;
let pf: typeof import("../profile.server");

async function rejects(p: Promise<unknown>, status: number) {
  await assert.rejects(p, (e: { status?: number }) => e.status === status);
}

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  pf = await import("../profile.server");
  await db.user.deleteMany({ where: { email: { endsWith: "@prof.test" } } });
});
after(async () => {
  if (skip) return;
  await db.user.deleteMany({ where: { email: { endsWith: "@prof.test" } } });
  await db.$disconnect();
});

test("profiel: gegevens bewaren, valideren en wachtwoord wijzigen", { skip }, async () => {
  const u = await db.user.create({ data: { name: "Piet", email: "piet@prof.test", passwordHash: await bcrypt.hash("oudwachtwoord", 4), roles: ["HUB", "TICKETING_ADMIN"] as never } });

  const p0 = await pf.getProfile(u.id);
  assert.equal(p0.notifyCommercialDigest, true);
  assert.deepEqual(p0.roles, ["Communicatie", "Ticketingbeheerder"]);
  assert.equal(p0.phone, null);

  await pf.updateProfile(u.id, { name: "  Piet Jansen ", phone: "06 12 34 56 78", jobTitle: "Penningmeester", notifyCommercialDigest: false });
  const p1 = await pf.getProfile(u.id);
  assert.equal(p1.name, "Piet Jansen");
  assert.equal(p1.phone, "06 12 34 56 78");
  assert.equal(p1.jobTitle, "Penningmeester");
  assert.equal(p1.notifyCommercialDigest, false);

  // Leegmaken van optionele velden kan; deelwijzigingen laten de rest staan.
  await pf.updateProfile(u.id, { phone: "" });
  assert.equal((await pf.getProfile(u.id)).phone, null);
  assert.equal((await pf.getProfile(u.id)).jobTitle, "Penningmeester");

  await rejects(pf.updateProfile(u.id, { name: "  " }), 400);
  await rejects(pf.updateProfile(u.id, { phone: "bel mij maar" }), 400);
  await rejects(pf.updateProfile(u.id, { jobTitle: "x".repeat(81) }), 400);
  await rejects(pf.updateProfile(u.id, {}), 400);

  // Wachtwoord: huidig vereist, nieuw moet verschillen en lang genoeg zijn.
  await rejects(pf.changePassword(u.id, "fout", "nieuwwachtwoord"), 403);
  await rejects(pf.changePassword(u.id, "oudwachtwoord", "kort"), 400);
  await rejects(pf.changePassword(u.id, "oudwachtwoord", "oudwachtwoord"), 400);
  await pf.changePassword(u.id, "oudwachtwoord", "nieuwwachtwoord");
  const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  assert.ok(await bcrypt.compare("nieuwwachtwoord", row.passwordHash));
  assert.equal(await bcrypt.compare("oudwachtwoord", row.passwordHash), false);
});
