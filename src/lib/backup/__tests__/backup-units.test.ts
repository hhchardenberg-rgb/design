import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { decryptBackup, encryptBackup, ENCRYPTION_OVERHEAD, parseKey } from "../crypto";
import { selectExpired } from "../retention";

const key = randomBytes(32);

test("versleutelen en ontsleutelen geeft exact dezelfde inhoud terug", () => {
  const plain = randomBytes(10_000);
  const enc = encryptBackup(plain, key);
  assert.equal(enc.length, plain.length + ENCRYPTION_OVERHEAD);
  assert.deepEqual(decryptBackup(enc, key), plain);
});

test("verkeerde sleutel of geknoeid bestand faalt", () => {
  const enc = encryptBackup(Buffer.from("geheim"), key);
  assert.throws(() => decryptBackup(enc, randomBytes(32)), /Verkeerde sleutel/);
  const tampered = Buffer.from(enc);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptBackup(tampered, key));
});

test("sleutel moet 32 bytes zijn", () => {
  assert.throws(() => parseKey(undefined), /ontbreekt/);
  assert.throws(() => parseKey(Buffer.alloc(16).toString("base64")), /32 bytes/);
  assert.equal(parseKey(key.toString("base64")).length, 32);
});

test("bewaartermijn: 14 dagen alles, dan per week en per maand één", () => {
  const now = new Date("2026-11-05T02:00:00Z");
  const items = Array.from({ length: 500 }, (_, i) => ({ id: `d${i}`, createdAt: new Date(now.getTime() - i * 24 * 3600 * 1000) }));
  const expired = new Set(selectExpired(items, now));
  const kept = items.filter((i) => !expired.has(i.id));
  // Laatste 14 dagen allemaal bewaard.
  for (let i = 0; i <= 14; i++) assert.ok(!expired.has(`d${i}`), `dag ${i}`);
  // Niet meer dan 15 dagelijkse + 8 wekelijkse + 12 maandelijkse.
  assert.ok(kept.length <= 15 + 8 + 13, `bewaard: ${kept.length}`);
  // Iets van ~11 maanden geleden is er nog, van 2 jaar geleden niet.
  assert.ok(kept.some((k) => now.getTime() - k.createdAt.getTime() > 300 * 24 * 3600 * 1000));
  assert.ok(!kept.some((k) => now.getTime() - k.createdAt.getTime() > 400 * 24 * 3600 * 1000));
});

test("de nieuwste back-up blijft altijd bewaard", () => {
  const now = new Date("2026-11-05T00:00:00Z");
  const old = [{ id: "oud", createdAt: new Date("2023-01-01T00:00:00Z") }, { id: "ouder", createdAt: new Date("2022-01-01T00:00:00Z") }];
  assert.deepEqual(selectExpired(old, now), ["ouder"]);
});
