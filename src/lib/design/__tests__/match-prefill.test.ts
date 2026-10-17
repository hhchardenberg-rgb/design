import { test } from "node:test";
import assert from "node:assert/strict";
import { matchPrefill, type PrefillMatch } from "../match-prefill";

const base: PrefillMatch = {
  isHome: false,
  date: new Date("2026-10-18T12:30:00Z"),
  competition: "Hoofdklasse",
  location: null,
  scoreHome: 2,
  scoreAway: 0,
  team: { id: "t1", name: "HHC Heren 1", logoUrl: "https://x/hhc.png" },
  opponent: { id: "o1", name: "SC Rijssen", logoUrl: "https://x/rijssen.png" },
};

test("uitwedstrijd: tegenstander blijft de tegenstander, thuis staat uit", () => {
  const fields = [
    { key: "tegenstander", type: "TEXT" },
    { key: "logo_tegenstander", type: "LOGO" },
    { key: "datum", type: "DATE" },
    { key: "tijd", type: "TIME" },
    { key: "thuis", type: "CHECKBOX" },
    { key: "uit", type: "CHECKBOX" },
    { key: "home_team", type: "TEXT" },
    { key: "logo_uit", type: "LOGO" },
    { key: "score_home", type: "SCORE" },
    { key: "locatie", type: "TEXT" },
  ];
  const out = matchPrefill(fields, base);
  assert.equal(out.tegenstander, "SC Rijssen");
  assert.equal((out.logo_tegenstander as { asset: { kind: string } }).asset.kind, "opponent");
  assert.equal(out.datum, "Zondag 18 oktober");
  assert.equal(out.tijd, "14:30", "Europe/Amsterdam (zomertijd)");
  assert.equal(out.thuis, false);
  assert.equal(out.uit, true);
  assert.equal(out.home_team, "SC Rijssen");
  assert.equal((out.logo_uit as { assetUrl: string }).assetUrl, "https://x/hhc.png");
  assert.equal(out.score_home, "2");
  assert.equal("locatie" in out, false, "geen waarde: niet invullen");
});

test("thuiswedstrijd in het Engels", () => {
  const out = matchPrefill(
    [{ key: "opponent", type: "TEXT" }, { key: "home", type: "CHECKBOX" }, { key: "competition", type: "TEXT" }, { key: "opponent", type: "IMAGE" }],
    { ...base, isHome: true }
  );
  assert.equal(out.opponent, "SC Rijssen");
  assert.equal(out.home, true);
  assert.equal(out.competition, "Hoofdklasse");
});
