import test from "node:test";
import assert from "node:assert/strict";
import { eligibleEvents, missedStreak } from "../seasonpass.server";

const ev = (id: string, day: number, over: Record<string, unknown> = {}) => ({ id, title: id, startsAt: new Date(Date.UTC(2026, 8, day)), endsAt: new Date(Date.UTC(2026, 8, day, 2)), status: "ACTIVE", seasonId: "s1", competition: "Eerste divisie", isHome: true, allowReentry: false, ...over });
const card = { id: "c", status: "ACTIVE", validityMode: "SEASON", validFrom: null, validUntil: null, seasonId: "s1", competitions: [] as string[], homeOnly: true, isSeasonCard: true, zoneId: null };

test("alleen thuisduels van het eigen seizoen tellen mee, gesorteerd op aftrap", () => {
  const list = eligibleEvents(card, [ev("c", 20), ev("a", 5), ev("uit", 10, { isHome: false }), ev("ander", 12, { seasonId: "s2" }), ev("afgelast", 14, { status: "CANCELLED" })]);
  assert.deepEqual(list.map((e) => e.id), ["a", "c"]);
});

test("competitiefilter van de pas wordt gevolgd", () => {
  const cup = ev("beker", 7, { competition: "KNVB beker" });
  assert.deepEqual(eligibleEvents({ ...card, competitions: ["Eerste divisie"] }, [ev("a", 5), cup]).map((e) => e.id), ["a"]);
});

test("gemiste duels op rij tellen vanaf het laatste duel", () => {
  assert.equal(missedStreak(["a", "b", "c", "d"], new Set(["a", "b"])), 2);
  assert.equal(missedStreak(["a", "b", "c"], new Set(["c"])), 0);
  assert.equal(missedStreak(["a", "b"], new Set()), 2);
  assert.equal(missedStreak([], new Set()), 0);
});
