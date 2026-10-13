import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDay, formatDayTime } from "./date-format";

test("datums altijd als dd/mm/jjjj", () => {
  assert.equal(formatDay("2026-09-01"), "01/09/2026");
  assert.equal(formatDay("2027-08-31"), "31/08/2027");
  // Middernacht Nederlandse tijd is de vorige dag in UTC: toch de juiste dag.
  assert.equal(formatDay(new Date("2026-10-12T22:30:00Z")), "13/10/2026");
  assert.equal(formatDay("2026-10-13T08:00:00.000Z"), "13/10/2026");
  assert.equal(formatDay(null), "–");
  assert.equal(formatDay("", ""), "");
  assert.equal(formatDayTime("2026-10-13T12:05:00Z"), "13/10/2026 14:05");
  assert.equal(formatDayTime(new Date("2026-01-05T09:00:00Z")), "05/01/2026 10:00");
});
