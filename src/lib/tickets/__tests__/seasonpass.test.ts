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

import { parseMembers } from "../guestlist.server";

test("gastenlijst: plakregels met puntkomma, komma en aantal worden gelezen", () => {
  const r = parseMembers("Jan Smit; jan@bakkerij.nl; Bakkerij Smit; 4\nAnna de Vries, anna@example.nl\n\nAlleen");
  assert.equal(r.members.length, 2);
  assert.deepEqual(r.members[0], { firstName: "Jan", lastName: "Smit", email: "jan@bakkerij.nl", company: "Bakkerij Smit", seats: 4 });
  assert.equal(r.members[1].lastName, "de Vries");
  assert.equal(r.members[1].seats, 1);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].line, 4);
});

test("gastenlijst: ongeldig e-mailadres of aantal wordt gemeld", () => {
  const r = parseMembers("Jan Smit; geen-mail\nPiet Pot; p@x.nl; ; 99");
  assert.equal(r.members.length, 0);
  assert.equal(r.errors.length, 2);
});

import { dedupeRecipients } from "../eventchange.server";

test("verplaatsen: één mail per e-mailadres, ongeacht hoofdletters", () => {
  const r = dedupeRecipients([
    { id: "b", email: "Jan@Test.nl" },
    { id: "a", email: "jan@test.nl" },
    { id: "c", email: "anna@test.nl" },
    { id: "d", email: null },
  ]);
  assert.deepEqual(r.map((x) => x.id), ["a", "c"]);
});

import { newPromoCode, normalizeCode, promoAvailability } from "../promo.server";

test("actiecode: leesbaar, zonder verwarrende tekens en normaliseert invoer", () => {
  for (let i = 0; i < 50; i++) assert.match(newPromoCode(), /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(normalizeCode(" ab12 cd "), "AB12CD");
});

test("actiecode: beschikbaarheid volgt status, tijdvak en maximum", () => {
  const base = { active: true, claimFrom: null, claimUntil: null, maxClaims: 2, claimed: 0 };
  const now = new Date("2026-11-14T12:00:00Z");
  assert.equal(promoAvailability(base, now).ok, true);
  assert.equal(promoAvailability({ ...base, active: false }, now).ok, false);
  assert.equal(promoAvailability({ ...base, claimed: 2 }, now).ok, false);
  assert.equal(promoAvailability({ ...base, claimFrom: new Date("2026-11-15T00:00:00Z") }, now).ok, false);
  assert.equal(promoAvailability({ ...base, claimUntil: new Date("2026-11-13T00:00:00Z") }, now).ok, false);
});

test("banner: lopend binnen de periode en alleen als actief", async () => {
  const { bannerLive } = await import("../banner.server");
  const now = new Date("2026-11-13T12:00:00Z");
  assert.equal(bannerLive({ active: true, startsOn: null, endsOn: null }, now), true);
  assert.equal(bannerLive({ active: false, startsOn: null, endsOn: null }, now), false);
  assert.equal(bannerLive({ active: true, startsOn: new Date("2026-11-14T00:00:00Z"), endsOn: null }, now), false);
  assert.equal(bannerLive({ active: true, startsOn: null, endsOn: new Date("2026-11-13T00:00:00Z") }, now), true, "einddatum geldt tot en met die dag");
  assert.equal(bannerLive({ active: true, startsOn: null, endsOn: new Date("2026-11-12T00:00:00Z") }, now), false);
});

test("trends: samenvatting, beste en minste duel en verschil met het gemiddelde", async () => {
  const { summarize, pctOf } = await import("../trends.server");
  const g = (id: string, sold: number, admitted: number, past = true) => ({ id, title: id, startsAt: "2026-09-01T12:00:00Z", isHome: true, competition: null, past, hhcSold: sold, fullhouseSold: 0, sold, admitted, pct: pctOf(admitted, sold) });
  const r = summarize([g("a", 100, 80), g("b", 100, 40), g("c", 0, 0), g("d", 100, 0, false)]);
  assert.equal(r.summary.pastGames, 2);
  assert.equal(r.summary.averageAdmitted, 60);
  assert.equal(r.summary.averagePct, 60);
  assert.equal(r.summary.bestId, "a");
  assert.equal(r.summary.worstId, "b");
  assert.equal(r.games.find((x) => x.id === "a")!.deltaToAverage, 20);
  assert.equal(r.games.find((x) => x.id === "d")!.deltaToAverage, null);
  assert.equal(pctOf(5, 0), null);
  assert.equal(pctOf(12, 10), 100);
});
