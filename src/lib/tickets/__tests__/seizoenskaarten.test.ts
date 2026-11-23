// Seizoenskaarten: elk duel van het seizoen, uitgesloten duels, Nederlandse tijd, dubbel scannen en aanwezigheid.
import { test } from "node:test";
import assert from "node:assert/strict";
import { amsterdamEndOfDay, amsterdamStartOfDay, computeValidUntil, coversEvent, evaluateScan, isDuplicateScan, seasonCardMismatch, type RuleEvent, type RuleTicket } from "../rules";
import { checkOffline, type OfflineCache } from "../offline-check";
import { amsterdamCalendarDay, pickSeason } from "../season-link.server";
import { eligibleEvents, gameState } from "../seasonpass.server";
import { sheetNames, toXlsxBook } from "../export";

const NOW = new Date("2026-11-15T14:00:00Z");
const ev = (e: Partial<RuleEvent> = {}): RuleEvent => ({
  id: "e1",
  status: "ACTIVE",
  seasonId: "s1",
  competition: "Eredivisie",
  isHome: true,
  startsAt: new Date("2026-11-15T13:30:00Z"),
  endsAt: new Date("2026-11-15T19:30:00Z"),
  allowReentry: true,
  ...e,
});
const tk = (t: Partial<RuleTicket> = {}): RuleTicket => ({
  status: "ACTIVE",
  validityMode: "SEASON",
  validFrom: null,
  validUntil: new Date("2027-06-30T21:59:59.999Z"),
  seasonId: "s1",
  competitions: [],
  eventIds: [],
  homeOnly: true,
  isSeasonCard: true,
  zoneId: null,
  ...t,
});

// ── Nederlandse tijd ──

test("begin en einde van een dag in Nederlandse tijd, ook rond zomer- en wintertijd", () => {
  const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
  assert.equal(amsterdamStartOfDay(day("2027-01-15")).toISOString(), "2027-01-14T23:00:00.000Z");
  assert.equal(amsterdamEndOfDay(day("2027-01-15")).toISOString(), "2027-01-15T22:59:59.999Z");
  assert.equal(amsterdamStartOfDay(day("2027-07-01")).toISOString(), "2027-06-30T22:00:00.000Z");
  assert.equal(amsterdamEndOfDay(day("2027-06-30")).toISOString(), "2027-06-30T21:59:59.999Z");
  // 28 maart 2027: om 02:00 naar zomertijd.
  assert.equal(amsterdamStartOfDay(day("2027-03-28")).toISOString(), "2027-03-27T23:00:00.000Z");
  assert.equal(amsterdamEndOfDay(day("2027-03-28")).toISOString(), "2027-03-28T21:59:59.999Z");
  // 25 oktober 2026: om 03:00 terug naar wintertijd.
  assert.equal(amsterdamStartOfDay(day("2026-10-25")).toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal(amsterdamEndOfDay(day("2026-10-25")).toISOString(), "2026-10-25T22:59:59.999Z");
});

test("seizoenskaart verloopt om 23:59 Nederlandse tijd, niet om 01:59 de nacht erna", () => {
  const until = computeValidUntil("SEASON", { events: [], seasonEndsOn: new Date("2027-06-30T00:00:00Z") })!;
  const t = tk({ validUntil: until });
  const late = ev({ startsAt: new Date("2027-06-30T19:00:00Z"), endsAt: new Date("2027-06-30T23:00:00Z") });
  assert.equal(evaluateScan(t, late, 0, new Date("2027-06-30T21:30:00Z")).result, "VALID", "23:30 in Nederland: nog geldig");
  assert.deepEqual(evaluateScan(t, late, 0, new Date("2027-06-30T22:30:00Z")), { result: "INVALID", reason: "EXPIRED" }, "00:30 in Nederland: verlopen");
});

test("kalenderdag van een aftrap en het seizoen waar die in valt", () => {
  assert.equal(amsterdamCalendarDay(new Date("2027-06-30T22:30:00Z")).toISOString(), "2027-07-01T00:00:00.000Z");
  const seasons = [
    { id: "a", startsOn: new Date("2026-07-01T00:00:00Z"), endsOn: new Date("2027-06-30T00:00:00Z") },
    { id: "b", startsOn: new Date("2027-07-01T00:00:00Z"), endsOn: new Date("2028-06-30T00:00:00Z") },
  ];
  assert.equal(pickSeason(new Date("2027-06-30T22:30:00Z"), seasons), "b", "00:30 op 1 juli hoort bij het nieuwe seizoen");
  assert.equal(pickSeason(new Date("2027-06-30T21:30:00Z"), seasons), "a");
  assert.equal(pickSeason(new Date("2030-01-01T12:00:00Z"), seasons), null, "buiten elk seizoen");
  assert.equal(pickSeason(new Date("2027-01-01T12:00:00Z"), [...seasons, { id: "c", startsOn: new Date("2026-12-01T00:00:00Z"), endsOn: new Date("2027-02-01T00:00:00Z") }]), null, "overlappende seizoenen: niet gokken");
});

// ── Elk duel, behalve uitgesloten duels ──

test("seizoenskaart geldt voor elk thuisduel van het seizoen, ook een nieuw toegevoegd duel", () => {
  assert.equal(coversEvent(tk(), ev({ id: "nieuw" })), true);
  assert.equal(evaluateScan(tk(), ev({ id: "nieuw" }), 0, NOW).result, "VALID");
});

test("uitgesloten duel: seizoenskaart geen toegang, los ticket voor dat duel wel", () => {
  const excluded = ev({ excludeSeasonCards: true });
  assert.equal(coversEvent(tk(), excluded), false);
  assert.deepEqual(evaluateScan(tk(), excluded, 0, NOW), { result: "INVALID", reason: "WRONG_EVENT" });
  // Een periodekaart die als seizoenskaart is gemarkeerd volgt dezelfde regel.
  assert.equal(coversEvent(tk({ validityMode: "RANGE", seasonId: null, validFrom: null }), excluded), false);
  // Losse tickets en gewone periodetickets merken niets van de uitsluiting.
  assert.equal(coversEvent(tk({ validityMode: "SINGLE", isSeasonCard: false, eventIds: ["e1"] }), excluded), true);
  assert.equal(coversEvent(tk({ validityMode: "MULTI", isSeasonCard: true, eventIds: ["e1"] }), excluded), true, "bewust gekoppeld blijft geldig");
  assert.equal(coversEvent(tk({ validityMode: "RANGE", isSeasonCard: false, seasonId: null, validFrom: null }), excluded), true);
});

test("duidelijke reden waarom een seizoenskaart niet geldt", () => {
  const name = (id: string) => (id === "s1" ? "2026/2027" : null);
  assert.equal(seasonCardMismatch(tk(), ev(), name), null, "geldig: geen reden");
  assert.match(seasonCardMismatch(tk(), ev({ excludeSeasonCards: true }), name)!, /gelden niet voor dit duel/);
  assert.match(seasonCardMismatch(tk(), ev({ isHome: false }), name)!, /alleen voor thuisduels/);
  assert.match(seasonCardMismatch(tk(), ev({ seasonId: "s2" }), name)!, /seizoen 2026\/2027/);
  assert.match(seasonCardMismatch(tk(), ev({ seasonId: null }), name)!, /geen seizoen/);
  assert.match(seasonCardMismatch(tk({ competitions: ["Beker"] }), ev(), name)!, /alleen voor: Beker/);
  assert.equal(seasonCardMismatch(tk({ isSeasonCard: false, validityMode: "SINGLE", eventIds: [] }), ev(), name), null, "geen seizoenskaart: andere uitleg");
});

test("herintrede: seizoenskaart opnieuw binnen als het duel het toestaat", () => {
  assert.deepEqual(evaluateScan(tk(), ev({ allowReentry: true }), 1, NOW), { result: "VALID", reentry: true });
  assert.deepEqual(evaluateScan(tk(), ev({ allowReentry: false }), 1, NOW), { result: "WARNING", reason: "ALREADY_USED" });
});

// ── Dubbel scannen ──

test("dubbel gescand: alleen zelfde toestel en binnen twee minuten", () => {
  const at = new Date("2026-11-15T13:00:00Z");
  const later = (s: number) => new Date(at.getTime() + s * 1000);
  assert.equal(isDuplicateScan({ at, device: "s1" }, { at: later(30), device: "s1" }), true);
  assert.equal(isDuplicateScan({ at, device: "s1" }, { at: later(120), device: "s1" }), true);
  assert.equal(isDuplicateScan({ at, device: "s1" }, { at: later(121), device: "s1" }), false, "na twee minuten: echte tweede scan");
  assert.equal(isDuplicateScan({ at, device: "s1" }, { at: later(10), device: "s2" }), false, "ander toestel: kan doorgeven over het hek zijn");
  assert.equal(isDuplicateScan({ at, device: null }, { at: later(10), device: null }), false, "onbekend toestel: geen aanname");
  assert.equal(isDuplicateScan(null, { at, device: "s1" }), false);
});

test("offline: zelfde kaart binnen twee minuten op dit toestel is 'net al gescand'", () => {
  const PID = "0123456789ABCDEF";
  const CODE = `HHC1.${PID}.1.${"A".repeat(22)}`;
  const cache: OfflineCache = { event: { id: "e1", title: "T" }, generatedAt: "2026-11-15T10:00:00Z", expiresAt: "2026-11-15T22:00:00Z", hhc: [{ p: PID, v: 1, l: "A. Jansen · Seizoenskaart", z: null, r: true }], fullhouse: [], used: [] };
  const now = new Date("2026-11-15T14:00:00Z");
  const dup = checkOffline(cache, CODE, null, new Map([[PID, "2026-11-15T13:59:20Z"]]), null, now);
  assert.equal(dup.result, "WARNING");
  assert.equal(dup.result === "WARNING" && dup.duplicate, true);
  const reentry = checkOffline(cache, CODE, null, new Map([[PID, "2026-11-15T13:30:00Z"]]), null, now);
  assert.equal(reentry.result, "VALID");
  assert.equal(reentry.reentry, true, "na een half uur: opnieuw binnen");
  // Eerder binnen volgens de lijst van de server (ander toestel): geen 'net al gescand'.
  const other = checkOffline({ ...cache, hhc: [{ ...cache.hhc[0], r: false }], used: [{ k: PID, at: "2026-11-15T13:59:50Z" }] }, CODE, null, new Map(), null, now);
  assert.equal(other.result, "WARNING");
  assert.equal(other.result === "WARNING" && !!other.duplicate, false);
});

// ── Aanwezigheid ──

const card = (over: Partial<Parameters<typeof gameState>[0]> = {}) => ({ id: "c1", status: "ACTIVE", validityMode: "SEASON", validFrom: null, validUntil: null, seasonId: "s1", competitions: [], homeOnly: true, isSeasonCard: true, zoneId: null, createdAt: new Date("2026-08-01T00:00:00Z"), ...over });
const game = (over: Partial<Parameters<typeof gameState>[1]> = {}) => ({ id: "g1", title: "HHC – Test", startsAt: new Date("2026-11-08T13:30:00Z"), endsAt: new Date("2026-11-08T19:30:00Z"), status: "ACTIVE", seasonId: "s1", competition: null, isHome: true, allowReentry: true, excludeSeasonCards: false, ...over });

test("stand per duel: geweest, niet geweest, nog te spelen, afgelast, uitgesloten", () => {
  assert.equal(gameState(card(), game(), true, NOW), "ATTENDED");
  assert.equal(gameState(card(), game(), false, NOW), "MISSED");
  assert.equal(gameState(card(), game({ startsAt: new Date("2026-11-22T13:30:00Z"), endsAt: new Date("2026-11-22T19:30:00Z") }), false, NOW), "UPCOMING");
  assert.equal(gameState(card(), game({ status: "CANCELLED" }), false, NOW), "CANCELLED");
  assert.equal(gameState(card(), game({ excludeSeasonCards: true }), false, NOW), "EXCLUDED");
  assert.equal(gameState(card(), game({ excludeSeasonCards: true }), true, NOW), "ATTENDED", "toch toegelaten (supervisor): telt als geweest");
  assert.equal(gameState(card(), game({ isHome: false }), false, NOW), null, "uitduel hoort er niet bij");
  assert.equal(gameState(card({ createdAt: new Date("2026-11-10T00:00:00Z") }), game(), false, NOW), "NOT_ISSUED", "pas later uitgegeven: niet gemist");
});

test("telbare duels: zonder afgelaste, uitgesloten en duels van voor de uitgifte", () => {
  const list = [game({ id: "a" }), game({ id: "b", status: "CANCELLED" }), game({ id: "c", excludeSeasonCards: true }), game({ id: "d", startsAt: new Date("2026-08-02T13:30:00Z"), endsAt: new Date("2026-08-02T19:30:00Z") }), game({ id: "e", startsAt: new Date("2026-07-20T13:30:00Z"), endsAt: new Date("2026-07-20T19:30:00Z") })];
  assert.deepEqual(eligibleEvents(card(), list).map((e) => e.id), ["d", "a"]);
});

test("Excel: meerdere werkbladen met geldige, unieke namen", async () => {
  assert.deepEqual(sheetNames(["Per duel", "Per duel", "a/b: c?", "x".repeat(40)]), ["Per duel", "Per duel 2", "a b c", "x".repeat(31)]);
  const bytes = await toXlsxBook([
    { name: "Per houder", rows: [["Houder", "Duel 1"], ["A. Jansen", "✓"]] },
    { name: "Per duel", rows: [["Duel", "Aanwezig"], ["HHC – Test", 1]] },
  ]);
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file("xl/worksheets/sheet2.xml"));
  const wb = await zip.file("xl/workbook.xml")!.async("string");
  assert.match(wb, /name="Per houder"/);
  assert.match(wb, /name="Per duel"/);
  assert.match(await zip.file("xl/worksheets/sheet1.xml")!.async("string"), /✓/);
});
