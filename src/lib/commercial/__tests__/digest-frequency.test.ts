import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveDigestFrequency, isDigestDay, nextDigestDay } from "../digest-frequency";

// 2026-10-12 is een maandag, 2026-10-15 een donderdag.
test("verzenddagen per frequentie", () => {
  assert.equal(isDigestDay("DAILY", "2026-10-14"), true);
  assert.equal(isDigestDay("OFF", "2026-10-12"), false);
  assert.equal(isDigestDay("TWICE_WEEKLY", "2026-10-12"), true);
  assert.equal(isDigestDay("TWICE_WEEKLY", "2026-10-15"), true);
  assert.equal(isDigestDay("TWICE_WEEKLY", "2026-10-13"), false);
  assert.equal(isDigestDay("WEEKLY", "2026-10-12"), true);
  assert.equal(isDigestDay("WEEKLY", "2026-10-13"), false);
  assert.equal(isDigestDay("MONTHLY", "2026-10-05"), true);
  assert.equal(isDigestDay("MONTHLY", "2026-10-12"), false);
  assert.equal(isDigestDay("MONTHLY", "2026-11-02"), true);
});

test("om de week: precies elke veertien dagen, ook over de jaarwisseling", () => {
  let day = "2026-10-12";
  if (!isDigestDay("BIWEEKLY", day)) day = nextDigestDay("BIWEEKLY", day)!;
  for (let i = 0; i < 20; i++) {
    const next = nextDigestDay("BIWEEKLY", day)!;
    assert.equal((Date.parse(next) - Date.parse(day)) / 86_400_000, 14);
    day = next;
  }
});

test("volgende verzenddag", () => {
  assert.equal(nextDigestDay("DAILY", "2026-10-13"), "2026-10-14");
  assert.equal(nextDigestDay("TWICE_WEEKLY", "2026-10-12"), "2026-10-15");
  assert.equal(nextDigestDay("WEEKLY", "2026-10-12"), "2026-10-19");
  assert.equal(nextDigestDay("MONTHLY", "2026-10-05"), "2026-11-02");
  assert.equal(nextDigestDay("OFF", "2026-10-05"), null);
});

test("geldende frequentie", () => {
  assert.equal(effectiveDigestFrequency({ notifyCommercialDigest: false, commercialDigestFrequency: "WEEKLY" }, "DAILY"), "OFF");
  assert.equal(effectiveDigestFrequency({ notifyCommercialDigest: true, commercialDigestFrequency: null }, "WEEKLY"), "WEEKLY");
  assert.equal(effectiveDigestFrequency({ notifyCommercialDigest: true, commercialDigestFrequency: "MONTHLY" }, "DAILY"), "MONTHLY");
  assert.equal(effectiveDigestFrequency({ notifyCommercialDigest: true, commercialDigestFrequency: "onzin" }, "DAILY"), "DAILY");
});
