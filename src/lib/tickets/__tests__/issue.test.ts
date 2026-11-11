import { test } from "node:test";
import assert from "node:assert/strict";
import { initialsOf, needsApproval, resolveValidity, type TypeForIssue } from "../issue";

const NOW = new Date("2026-11-11T12:00:00Z");
const type = (t: Partial<TypeForIssue> = {}): TypeForIssue => ({
  category: "FREE",
  validityMode: "SINGLE",
  isSeasonCard: false,
  seasonId: null,
  competitions: [],
  homeOnly: true,
  validFrom: null,
  validUntil: null,
  zoneId: "z1",
  active: true,
  ...t,
});
const events = [
  { id: "e1", status: "ACTIVE", endsAt: new Date("2026-11-15T19:30:00Z") },
  { id: "e2", status: "DRAFT", endsAt: new Date("2026-11-22T19:30:00Z") },
  { id: "old", status: "ACTIVE", endsAt: new Date("2026-11-01T19:30:00Z") },
  { id: "x", status: "CANCELLED", endsAt: new Date("2026-11-29T19:30:00Z") },
];
const none = { eventIds: [], seasonId: null, validFrom: null, validUntil: null, zoneId: null };

test("één wedstrijd: precies één, vervalt na de wedstrijd, standaardvak van het type", () => {
  const r = resolveValidity(type(), { ...none, eventIds: ["e1"] }, { events, season: null }, NOW);
  assert.ok(r.ok);
  assert.equal(r.value.validUntil?.toISOString(), "2026-11-15T19:30:00.000Z");
  assert.equal(r.value.zoneId, "z1");
  assert.equal(resolveValidity(type(), { ...none, eventIds: ["e1", "e2"] }, { events, season: null }, NOW).ok, false);
  assert.equal(resolveValidity(type(), none, { events, season: null }, NOW).ok, false);
});

test("geen tickets voor voorbije, afgelaste of onbekende wedstrijden", () => {
  assert.equal(resolveValidity(type(), { ...none, eventIds: ["old"] }, { events, season: null }, NOW).ok, false);
  assert.equal(resolveValidity(type(), { ...none, eventIds: ["x"] }, { events, season: null }, NOW).ok, false);
  assert.equal(resolveValidity(type(), { ...none, eventIds: ["nope"] }, { events, season: null }, NOW).ok, false);
});

test("meerdere wedstrijden: vervalt na de laatste", () => {
  const r = resolveValidity(type({ validityMode: "MULTI" }), { ...none, eventIds: ["e1", "e2"] }, { events, season: null }, NOW);
  assert.ok(r.ok);
  assert.equal(r.value.validUntil?.toISOString(), "2026-11-22T19:30:00.000Z");
});

test("seizoenskaart: seizoen verplicht, geldig tot einde seizoen", () => {
  const season = { id: "s1", startsOn: new Date("2026-07-01T00:00:00Z"), endsOn: new Date("2027-06-30T00:00:00Z") };
  const t = type({ validityMode: "SEASON", isSeasonCard: true, category: "SEASON", competitions: ["Eredivisie"] });
  assert.equal(resolveValidity(t, none, { events, season: null }, NOW).ok, false);
  const r = resolveValidity(t, { ...none, seasonId: "s1" }, { events, season }, NOW);
  assert.ok(r.ok);
  assert.equal(r.value.isSeasonCard, true);
  assert.deepEqual(r.value.competitions, ["Eredivisie"]);
  assert.equal(r.value.validUntil?.toISOString(), "2027-06-30T23:59:59.999Z");
});

test("periode: einddatum verplicht en niet in het verleden", () => {
  const t = type({ validityMode: "RANGE" });
  assert.equal(resolveValidity(t, none, { events, season: null }, NOW).ok, false);
  assert.equal(resolveValidity(t, { ...none, validUntil: new Date("2026-10-01T00:00:00Z") }, { events, season: null }, NOW).ok, false);
  assert.ok(resolveValidity(t, { ...none, validUntil: new Date("2026-12-31T00:00:00Z") }, { events, season: null }, NOW).ok);
});

test("inactief type kan niet worden uitgegeven", () => {
  assert.equal(resolveValidity(type({ active: false }), { ...none, eventIds: ["e1"] }, { events, season: null }, NOW).ok, false);
});

test("drempel voor goedkeuring", () => {
  assert.equal(needsApproval(50, 50), false);
  assert.equal(needsApproval(51, 50), true);
});

test("initialen voor wie geen contactgegevens mag zien", () => {
  assert.equal(initialsOf("Jan", "van Dijk"), "J.D.");
  assert.equal(initialsOf("eva", "jansen"), "E.J.");
});
