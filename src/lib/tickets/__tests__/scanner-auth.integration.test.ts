// Scanner-inlog met code en PIN: foute PIN, blokkade, intrekken. Overgeslagen zonder TEST_DATABASE_URL.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { TicketsActor } from "../authz.server";
import { ALL_TICKET_PERMISSIONS } from "../permissions";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;
process.env.TICKETS_ENABLED = "true";

let db: typeof import("@/lib/prisma")["prisma"];
let admin: typeof import("../scanner-admin.server");
let auth: typeof import("../scanner-auth.server");
const set = new Set(ALL_TICKET_PERMISSIONS);
const actor: TicketsActor = { id: "a", name: "Admin", access: { userId: "a", isSuperadmin: false, hasAccess: true, permissions: [...ALL_TICKET_PERMISSIONS], can: (p) => set.has(p) } };
const reqWith = (token: string) => new Request("http://x/api/scan/context", { headers: { authorization: `Bearer ${token}` } });

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  admin = await import("../scanner-admin.server");
  auth = await import("../scanner-auth.server");
  await db.ticketScanner.deleteMany();
});
after(async () => {
  if (skip) return;
  await db.ticketScanner.deleteMany();
  await db.ticketAuditEvent.deleteMany();
  await db.$disconnect();
});

test("inloggen, sessie gebruiken, foute PIN en blokkade", { skip }, async () => {
  const s = await admin.createScanner(actor, { name: "Ingang Noord", supervisor: true });
  assert.match(s.pin, /^\d{6}$/);
  const row = await db.ticketScanner.findUniqueOrThrow({ where: { id: s.id } });
  assert.notEqual(row.pinHash, s.pin, "de PIN staat niet leesbaar in de database");

  const ok = await auth.scannerLogin(s.loginCode.toLowerCase(), s.pin, null);
  const a = await auth.requireScanActor(reqWith(ok.token));
  assert.equal(a.kind, "scanner");
  assert.equal(a.canOverride, true);

  await assert.rejects(auth.scannerLogin(s.loginCode, "000000", null), /klopt niet/);
  await assert.rejects(auth.scannerLogin("ZZZZZ", s.pin, null), /klopt niet/, "onbekende code geeft dezelfde melding");
  for (let i = 0; i < 4; i++) await assert.rejects(auth.scannerLogin(s.loginCode, "111111", null));
  await assert.rejects(auth.scannerLogin(s.loginCode, s.pin, null), /Te vaak/, "geblokkeerd, ook met de goede PIN");
});

test("nieuwe PIN, uitschakelen en rechten wijzigen maken lopende sessies ongeldig", { skip }, async () => {
  const s = await admin.createScanner(actor, { name: "Ingang Zuid" });
  const t1 = (await auth.scannerLogin(s.loginCode, s.pin, null)).token;
  await auth.requireScanActor(reqWith(t1));
  const reset = await admin.resetScannerPin(actor, s.id);
  await assert.rejects(auth.requireScanActor(reqWith(t1)), /verlopen/);
  const t2 = (await auth.scannerLogin(s.loginCode, reset.pin, null)).token;
  await auth.requireScanActor(reqWith(t2));
  await admin.updateScanner(actor, s.id, { name: "Ingang Zuid", supervisor: false, active: false });
  await assert.rejects(auth.requireScanActor(reqWith(t2)), /verlopen/);
  await assert.rejects(auth.scannerLogin(s.loginCode, reset.pin, null), /klopt niet/);
});

test("een geknoeide of verlopen token wordt geweigerd", { skip }, async () => {
  await assert.rejects(auth.requireScanActor(reqWith("SCN.x.1.9999999999.AAAAAAAAAAAAAAAAAAAAAA")), /verlopen/);
});
