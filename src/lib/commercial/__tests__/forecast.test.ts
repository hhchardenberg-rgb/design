import { test } from "node:test";
import assert from "node:assert/strict";
import { standing, weightedCents } from "../forecast";

test("gewogen pijplijnwaarde per fase", () => {
  assert.equal(weightedCents("LEAD", 100_000), 10_000);
  assert.equal(weightedCents("CONTACTED", 100_000), 25_000);
  assert.equal(weightedCents("PROPOSAL", 100_000), 50_000);
  assert.equal(weightedCents("NEGOTIATION", 100_000), 75_000);
  assert.equal(weightedCents("WON", 100_000), 0); // gewonnen is al een contract
  assert.equal(weightedCents("LOST", 100_000), 0);
  assert.equal(weightedCents("LEAD", 333), 33); // afgerond op hele centen
});

test("stand: nog nodig, prognose, tekort en voortgang", () => {
  assert.deepEqual(standing(1_000_000, 400_000, 250_000), { missingCents: 600_000, forecastCents: 650_000, shortfallCents: 350_000, progressPercent: 40 });
  // Doel al gehaald: niets ontbreekt, voortgang boven 100.
  assert.deepEqual(standing(500_000, 600_000, 0), { missingCents: 0, forecastCents: 600_000, shortfallCents: 0, progressPercent: 120 });
  // Prognose haalt het doel, lopend nog niet.
  const s = standing(1_000_000, 700_000, 400_000);
  assert.equal(s.missingCents, 300_000);
  assert.equal(s.shortfallCents, 0);
  // Doel van nul: geen deling door nul.
  assert.equal(standing(0, 0, 0).progressPercent, 0);
});
