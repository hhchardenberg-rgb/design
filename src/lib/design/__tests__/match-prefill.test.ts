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

test("speler vult naam, nummer en foto", async () => {
  const { playerPrefill } = await import("../match-prefill");
  const out = playerPrefill(
    [
      { key: "speler", type: "SHORT_TEXT" },
      { key: "Rugnummer", type: "NUMBER" },
      { key: "speler_foto", type: "IMAGE" },
      { key: "foto", type: "IMAGE" },
      { key: "positie", type: "SHORT_TEXT" },
      { key: "tegenstander", type: "SHORT_TEXT" },
    ],
    {
      id: "p1",
      firstName: "Jan",
      lastName: "Jansen",
      number: 9,
      position: null,
      photoUrl: "https://x/p1.png",
      team: { id: "t1", name: "HHC 1", logoUrl: null },
    }
  );
  assert.equal(out.speler, "Jan Jansen");
  assert.equal((out.speler_foto as { asset: { id: string } }).asset.id, "p1");
  assert.equal(out.Rugnummer, "9");
  assert.deepEqual(out.foto, { asset: { kind: "player", id: "p1" }, assetUrl: "https://x/p1.png", panX: 0, panY: 0, scale: 1 });
  assert.equal("positie" in out, false);
  assert.equal("tegenstander" in out, false);
});
