import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonOptionLabel, seasonPhase } from "../season-phase";

test("seizoenen: huidig, afgelopen en aankomend", () => {
  const s = { name: "2026/2027", startsOn: "2026-09-01", endsOn: "2027-08-31" };
  assert.equal(seasonPhase(s, "2026-10-13"), "CURRENT");
  assert.equal(seasonPhase(s, "2026-09-01"), "CURRENT");
  assert.equal(seasonPhase(s, "2027-08-31"), "CURRENT");
  assert.equal(seasonPhase(s, "2026-08-31"), "UPCOMING");
  assert.equal(seasonPhase(s, "2027-09-01"), "PAST");
  assert.equal(seasonOptionLabel(s, "2026-10-13"), "2026/2027 (huidig)");
});
