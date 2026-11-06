import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { adminSessionExpired, ADMIN_SESSION_MS, allowedDuringMfaSetup, isElevated, mfaRequired } from "../auth-policy";
import { assertStrongPassword, breachCount } from "../password-policy.server";
import { decryptField, decryptFile, encryptField, encryptFile, isEncryptedFile, resetDataKeyCache } from "../data-crypto";
import { deviceLabel } from "../login-alerts.server";

test("tweestapsverificatie verplicht voor beheerders en Commerciële Zaken", () => {
  assert.equal(mfaRequired(["HUB"], false), false);
  assert.equal(mfaRequired(["TICKETING"], true), true);
  assert.equal(mfaRequired(["HUB_ADMIN"], false), true);
  assert.equal(mfaRequired(["ADMIN"], false), true);
  assert.ok(allowedDuringMfaSetup("/account/security"));
  assert.ok(allowedDuringMfaSetup("/api/account/mfa/totp/enroll"));
  assert.ok(!allowedDuringMfaSetup("/admin"));
  assert.ok(!allowedDuringMfaSetup("/api/commercial/tasks"));
});

test("beheerderssessie vervalt na 12 uur, gewone sessie niet", () => {
  const now = Date.now();
  assert.ok(isElevated(["TICKETING_ADMIN"]));
  assert.ok(adminSessionExpired(["ADMIN"], now - ADMIN_SESSION_MS - 1, now));
  assert.ok(!adminSessionExpired(["ADMIN"], now - ADMIN_SESSION_MS + 60_000, now));
  assert.ok(!adminSessionExpired(["HUB"], now - 10 * ADMIN_SESSION_MS, now));
});

const fakeHibp = (body: string, ok = true) => (async () => new Response(body, { status: ok ? 200 : 503 })) as unknown as typeof fetch;

test("wachtwoordregel: lengte, e-mailadres en gelekte wachtwoorden", async () => {
  await assert.rejects(assertStrongPassword("kort", {}, fakeHibp("")), /minimaal 12/);
  await assert.rejects(assertStrongPassword("jan.jansen@club.nl", { email: "jan.jansen@club.nl" }, fakeHibp("")), /e-mailadres/);
  await assert.rejects(assertStrongPassword("aaaaaaaaaaaaaa", {}, fakeHibp("")), /herhaald/);
  // SHA-1("wachtwoord1234") staat in de (nep)lijst → geweigerd.
  const { createHash } = await import("crypto");
  const suffix = createHash("sha1").update("wachtwoord1234").digest("hex").toUpperCase().slice(5);
  await assert.rejects(assertStrongPassword("wachtwoord1234", {}, fakeHibp(`${suffix}:42\nABC:1`)), /datalekken/);
  await assertStrongPassword("paars-fiets-onder-de-brug", {}, fakeHibp("ABC:1"));
  // Dienst onbereikbaar: niet blokkeren.
  assert.equal(await breachCount("x", fakeHibp("", false)), null);
  await assertStrongPassword("paars-fiets-onder-de-brug", {}, fakeHibp("", false));
});

test("veld- en bestandsversleuteling: heen en terug, platte tekst blijft leesbaar", () => {
  const prev = { key: process.env.DATA_ENCRYPTION_KEY, env: process.env.VERCEL_ENV };
  try {
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    delete process.env.VERCEL_ENV;
    resetDataKeyCache();
    const enc = encryptField("06-12345678");
    assert.ok(enc.startsWith("enc1:"));
    assert.equal(decryptField(enc), "06-12345678");
    assert.equal(decryptField("platte tekst"), "platte tekst");
    assert.equal(encryptField(null), null);
    const file = randomBytes(5000);
    const encFile = encryptFile(file);
    assert.ok(isEncryptedFile(encFile));
    assert.deepEqual(decryptFile(encFile), file);
    assert.deepEqual(decryptFile(file), file);

    // In een preview wordt niet versleuteld geschreven (database gedeeld met productie), wel gelezen.
    process.env.VERCEL_ENV = "preview";
    assert.equal(encryptField("06-1"), "06-1");
    assert.equal(decryptField(enc), "06-12345678");
  } finally {
    if (prev.key === undefined) delete process.env.DATA_ENCRYPTION_KEY;
    else process.env.DATA_ENCRYPTION_KEY = prev.key;
    if (prev.env === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prev.env;
    resetDataKeyCache();
  }
});

test("apparaatomschrijving", () => {
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"), "Chrome op Windows");
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), "Safari op iPhone/iPad");
});
