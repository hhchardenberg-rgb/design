import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheExpired, checkOffline, isTestCode, parseHhcCode, scanKey, ticketNumberFrom, type OfflineCache } from "../offline-check";

const PID = "0123456789ABCDEF";
const SIG = "A".repeat(22);
const CODE = `HHC1.${PID}.1.${SIG}`;
const NOW = new Date("2026-11-14T15:00:00Z");
const cache = (over: Partial<OfflineCache> = {}): OfflineCache => ({
  event: { id: "e1", title: "HHC - Test" },
  generatedAt: "2026-11-14T10:00:00Z",
  expiresAt: "2026-11-14T22:00:00Z",
  hhc: [{ p: PID, v: 1, l: "A. Jansen · VIP", z: null, r: false }],
  fullhouse: [{ h: "abc", l: "B. Bakker · Staanplaats" }],
  used: [],
  ...over,
});

test("parseHhcCode leest alleen een goed gevormde code", () => {
  assert.deepEqual(parseHhcCode(CODE), { publicId: PID, version: 1 });
  assert.equal(parseHhcCode("HHC1.kort.1.x"), null);
  assert.equal(parseHhcCode("FH-TEST-0001"), null);
});

test("bekende HHC-code is geldig, onbekende of oude versie niet", () => {
  assert.equal(checkOffline(cache(), CODE, null, new Map(), null, NOW).result, "VALID");
  assert.equal(checkOffline(cache(), `HHC1.${PID}.2.${SIG}`, null, new Map(), null, NOW).result, "INVALID");
  assert.equal(checkOffline(cache(), `HHC1.${"F".repeat(16)}.1.${SIG}`, null, new Map(), null, NOW).result, "INVALID");
});

test("tweede scan op dit apparaat of eerder op de server geeft een waarschuwing", () => {
  const local = new Map([[PID, "2026-11-14T14:00:00Z"]]);
  assert.equal(checkOffline(cache(), CODE, null, local, null, NOW).result, "WARNING");
  assert.equal(checkOffline(cache({ used: [{ k: PID, at: "2026-11-14T13:00:00Z" }] }), CODE, null, new Map(), null, NOW).result, "WARNING");
});

test("herintrede mag alleen als de lijst dat voor dit ticket aangeeft", () => {
  const c = cache({ hhc: [{ p: PID, v: 1, l: "x", z: null, r: true }] });
  const r = checkOffline(c, CODE, null, new Map([[PID, "2026-11-14T14:00:00Z"]]), null, NOW);
  assert.deepEqual([r.result, r.reentry], ["VALID", true]);
});

test("Fullhouse-code wordt op hash gevonden", () => {
  assert.equal(checkOffline(cache(), "12345", "abc", new Map(), null, NOW).result, "VALID");
  assert.equal(checkOffline(cache(), "12345", "zzz", new Map(), null, NOW).result, "INVALID");
  assert.equal(checkOffline(cache(), "12345", null, new Map(), null, NOW).result, "INVALID");
});

test("verkeerd vak en verlopen lijst worden geweigerd", () => {
  const c = cache({ hhc: [{ p: PID, v: 1, l: "x", z: "z1", r: false }] });
  assert.equal(checkOffline(c, CODE, null, new Map(), "z2", NOW).result, "INVALID");
  assert.equal(cacheExpired(cache(), new Date("2026-11-15T00:00:00Z")), true);
  assert.equal(checkOffline(cache(), CODE, null, new Map(), null, new Date("2026-11-15T00:00:00Z")).result, "INVALID");
});

test("ticketnummer werkt offline alleen voor een supervisor en alleen als het in de lijst staat", () => {
  const typed = "0123-4567-89ab-cdef";
  assert.equal(ticketNumberFrom(typed), PID);
  const denied = checkOffline(cache(), typed, null, new Map(), null, NOW);
  assert.deepEqual([denied.result, denied.reason], ["INVALID", "NUMBER_NOT_ALLOWED"]);
  const ok = checkOffline(cache(), typed, null, new Map(), null, NOW, { allowNumber: true });
  assert.deepEqual([ok.result, ok.key], ["VALID", PID]);
  // Onbekend nummer: wordt als Fullhouse-barcode behandeld (op hash), dus niet als "niet toegestaan".
  const unknown = checkOffline(cache(), "FFFF-FFFF-FFFF-FFFF", "zzz", new Map(), null, NOW);
  assert.deepEqual([unknown.result, unknown.reason], ["INVALID", "NOT_FOUND"]);
});

test("geldige scan geeft de sleutel terug, zodat het apparaat hem kan onthouden", () => {
  assert.equal(scanKey(CODE, null), PID);
  assert.equal(scanKey("12345", "abc"), "abc");
  const r = checkOffline(cache(), "12345", "abc", new Map(), null, NOW);
  assert.equal(r.key, "abc");
});

test("alleen de twee vaste testcodes zijn testcodes", () => {
  assert.equal(isTestCode("FH-TEST-0001"), true);
  assert.equal(isTestCode(" fh-test-down "), true);
  assert.equal(isTestCode("FH-TEST-0002"), false);
  assert.equal(isTestCode("constructor"), false);
});
