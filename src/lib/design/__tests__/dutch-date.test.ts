import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDutchDate, parseDutchDate } from "../dutch-date";

test("datum heen en terug: het jaar volgt uit de weekdag", () => {
  const today = new Date("2026-10-17T12:00:00Z");
  assert.equal(formatDutchDate("2026-10-18"), "Zondag 18 oktober");
  assert.equal(parseDutchDate("Zondag 18 oktober", today), "2026-10-18");
  // 18 oktober 2027 is een maandag
  assert.equal(parseDutchDate("Maandag 18 oktober", today), "2027-10-18");
  assert.equal(parseDutchDate("Zaterdag 3 januari", today), "2026-01-03");
  for (const iso of ["2026-01-01", "2026-02-28", "2027-06-30", "2026-12-31"]) {
    assert.equal(parseDutchDate(formatDutchDate(iso), today), iso);
  }
});

test("geen herkenbare datum: null", () => {
  assert.equal(parseDutchDate("volgende week"), null);
  assert.equal(parseDutchDate("Zondag 31 februari"), null);
  assert.equal(parseDutchDate("Blauwdag 3 mei"), null);
  assert.equal(parseDutchDate("2026-10-18"), "2026-10-18");
  assert.equal(parseDutchDate("18 oktober 2026"), "2026-10-18");
});
