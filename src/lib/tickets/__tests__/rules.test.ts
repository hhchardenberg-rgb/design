import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, computeValidUntil, coversEvent, displayStatus, evaluateScan, type RuleEvent, type RuleTicket } from "../rules";

const NOW = new Date("2026-11-15T14:00:00Z");
const ev = (e: Partial<RuleEvent> = {}): RuleEvent => ({
  id: "e1",
  status: "ACTIVE",
  seasonId: "s1",
  competition: "Eredivisie",
  isHome: true,
  startsAt: new Date("2026-11-15T13:30:00Z"),
  endsAt: new Date("2026-11-15T19:30:00Z"),
  allowReentry: false,
  ...e,
});
const tk = (t: Partial<RuleTicket> = {}): RuleTicket => ({
  status: "ACTIVE",
  validityMode: "SINGLE",
  validFrom: null,
  validUntil: new Date("2026-11-15T19:30:00Z"),
  seasonId: null,
  competitions: [],
  eventIds: ["e1"],
  homeOnly: true,
  isSeasonCard: false,
  zoneId: null,
  ...t,
});
const season = (t: Partial<RuleTicket> = {}) => tk({ validityMode: "SEASON", seasonId: "s1", eventIds: [], isSeasonCard: true, validUntil: new Date("2027-06-30T23:59:59Z"), ...t });

test("geldig ticket voor de juiste wedstrijd", () => {
  assert.deepEqual(evaluateScan(tk(), ev(), 0, NOW), { result: "VALID", reentry: false });
});

test("onbekend ticket", () => {
  assert.deepEqual(evaluateScan(null, ev(), 0, NOW), { result: "INVALID", reason: "NOT_FOUND" });
});

test("geannuleerd en geblokkeerd gaan voor alles", () => {
  assert.deepEqual(evaluateScan(tk({ status: "CANCELLED" }), ev(), 0, NOW), { result: "INVALID", reason: "CANCELLED" });
  assert.deepEqual(evaluateScan(tk({ status: "BLOCKED" }), ev(), 1, NOW), { result: "INVALID", reason: "BLOCKED" });
});

test("verlopen na afloop van de wedstrijd", () => {
  assert.deepEqual(evaluateScan(tk(), ev(), 0, new Date("2026-11-15T20:00:00Z")), { result: "INVALID", reason: "EXPIRED" });
});

test("ticket voor een andere wedstrijd", () => {
  assert.deepEqual(evaluateScan(tk({ eventIds: ["e2"] }), ev(), 0, NOW), { result: "INVALID", reason: "WRONG_EVENT" });
});

test("wedstrijd niet actief", () => {
  assert.deepEqual(evaluateScan(tk(), ev({ status: "DRAFT" }), 0, NOW), { result: "INVALID", reason: "EVENT_NOT_ACTIVE" });
});

test("gewoon ticket kan niet opnieuw worden gebruikt: tweede scan is een waarschuwing", () => {
  assert.deepEqual(evaluateScan(tk(), ev({ allowReentry: true }), 1, NOW), { result: "WARNING", reason: "ALREADY_USED" });
});

test("seizoenskaart: herintrede alleen als de wedstrijd het toestaat", () => {
  assert.deepEqual(evaluateScan(season(), ev({ allowReentry: true }), 1, NOW), { result: "VALID", reentry: true });
  assert.deepEqual(evaluateScan(season(), ev({ allowReentry: false }), 1, NOW), { result: "WARNING", reason: "ALREADY_USED" });
});

test("seizoenskaart: competitie, thuis/uit en seizoen", () => {
  assert.equal(coversEvent(season({ competitions: ["Beker"] }), ev()), false);
  assert.equal(coversEvent(season({ competitions: ["Eredivisie"] }), ev()), true);
  assert.equal(coversEvent(season(), ev({ isHome: false })), false);
  assert.equal(coversEvent(season({ homeOnly: false }), ev({ isHome: false })), true);
  assert.equal(coversEvent(season(), ev({ seasonId: "s2" })), false);
});

test("meerdere wedstrijden en periode", () => {
  assert.equal(coversEvent(tk({ validityMode: "MULTI", eventIds: ["e0", "e1"] }), ev()), true);
  const range = tk({ validityMode: "RANGE", eventIds: [], validFrom: new Date("2026-11-01T00:00:00Z"), validUntil: new Date("2026-11-30T23:59:59Z") });
  assert.equal(coversEvent(range, ev()), true);
  assert.equal(coversEvent(range, ev({ startsAt: new Date("2026-12-05T13:30:00Z") })), false);
  assert.deepEqual(evaluateScan({ ...range, validFrom: new Date("2026-11-16T00:00:00Z") }, ev(), 0, NOW), { result: "INVALID", reason: "NOT_YET_VALID" });
});

test("afgeleide status", () => {
  assert.equal(displayStatus(tk(), NOW), "ACTIVE");
  assert.equal(displayStatus(tk(), new Date("2026-12-01")), "EXPIRED");
  assert.equal(displayStatus(tk({ status: "BLOCKED" }), new Date("2026-12-01")), "BLOCKED");
});

test("statusovergangen", () => {
  assert.equal(canTransition("ACTIVE", "BLOCKED"), true);
  assert.equal(canTransition("BLOCKED", "ACTIVE"), true);
  assert.equal(canTransition("CANCELLED", "ACTIVE"), true);
  assert.equal(canTransition("CANCELLED", "BLOCKED"), false);
  assert.equal(canTransition("ACTIVE", "ACTIVE"), false);
});

test("vervaldatum per geldigheidsvorm", () => {
  const a = { endsAt: new Date("2026-11-15T19:30:00Z") };
  const b = { endsAt: new Date("2026-12-01T19:30:00Z") };
  assert.equal(computeValidUntil("MULTI", { events: [a, b] })?.toISOString(), b.endsAt.toISOString());
  assert.equal(computeValidUntil("SEASON", { events: [], seasonEndsOn: new Date("2027-06-30T00:00:00Z") })?.toISOString(), "2027-06-30T23:59:59.999Z");
  assert.equal(computeValidUntil("SINGLE", { events: [] }), null);
});

test("ticket voor een ander vak dan de ingang wordt geweigerd", () => {
  assert.deepEqual(evaluateScan(tk({ zoneId: "z1" }), ev(), 0, NOW, "z2"), { result: "INVALID", reason: "WRONG_ZONE" });
  assert.equal(evaluateScan(tk({ zoneId: "z1" }), ev(), 0, NOW, "z1").result, "VALID");
  assert.equal(evaluateScan(tk({ zoneId: "z1" }), ev(), 0, NOW, null).result, "VALID");
  assert.equal(evaluateScan(tk({ zoneId: null }), ev(), 0, NOW, "z2").result, "VALID");
});
