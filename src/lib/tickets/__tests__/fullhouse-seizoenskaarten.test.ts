// Fullhouse-seizoenskaarten: herkennen van het seizoensevenement en dezelfde regels als eigen seizoenskaarten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateScan, seasonCardMismatch, type RuleEvent } from "../rules";
import {
  fullhouseSeasonRuleTicket,
  isSeasonCardSource,
  isSeasonCardTitle,
  pickSeasonCard,
} from "../season-cards";
import { checkOffline, type OfflineCache } from "../offline-check";
import { fullhouseCardRow, gameState } from "../seasonpass.server";

const NOW = new Date("2026-11-15T14:00:00Z");
const ev = (e: Partial<RuleEvent> = {}): RuleEvent => ({
  id: "e1",
  status: "ACTIVE",
  seasonId: "s1",
  competition: null,
  isHome: true,
  startsAt: new Date("2026-11-15T13:30:00Z"),
  endsAt: new Date("2026-11-15T19:30:00Z"),
  allowReentry: true,
  ...e,
});

test("seizoensevenementen van Fullhouse worden op naam herkend", () => {
  for (const t of [
    "Seizoenskaart 2024-25",
    "Seizoenskaarten 2026-27",
    "Seizoenspassen 2025-26",
  ])
    assert.equal(isSeasonCardTitle(t), true, t);
  for (const t of [
    "HHC Hardenberg - Spakenburg",
    "HHC Hardenberg - BVV Barendrecht (Eurojackpot KNVB Beker)",
    "Seizoen opening",
  ])
    assert.equal(isSeasonCardTitle(t), false, t);
});

test("keuze van de beheerder gaat voor de naam, en alleen Fullhouse-evenementen tellen", () => {
  assert.equal(
    isSeasonCardSource({
      source: "FULLHOUSE",
      title: "Seizoenskaarten 2026-27",
      seasonCardSource: null,
    }),
    true,
  );
  assert.equal(
    isSeasonCardSource({
      source: "FULLHOUSE",
      title: "Seizoenskaarten 2026-27",
      seasonCardSource: false,
    }),
    false,
  );
  assert.equal(
    isSeasonCardSource({
      source: "FULLHOUSE",
      title: "Abonnement",
      seasonCardSource: true,
    }),
    true,
  );
  assert.equal(
    isSeasonCardSource({
      source: "HHC",
      title: "Seizoenskaarten 2026-27",
      seasonCardSource: true,
    }),
    false,
  );
});

test("Fullhouse-seizoenskaart: geldig bij elk thuisduel van het seizoen, herintrede, niet bij uitgesloten of ander seizoen", () => {
  const rt = fullhouseSeasonRuleTicket("s1");
  assert.deepEqual(evaluateScan(rt, ev(), 0, NOW), {
    result: "VALID",
    reentry: false,
  });
  assert.deepEqual(evaluateScan(rt, ev(), 1, NOW), {
    result: "VALID",
    reentry: true,
  });
  assert.deepEqual(evaluateScan(rt, ev({ allowReentry: false }), 1, NOW), {
    result: "WARNING",
    reason: "ALREADY_USED",
  });
  assert.deepEqual(evaluateScan(rt, ev({ excludeSeasonCards: true }), 0, NOW), {
    result: "INVALID",
    reason: "WRONG_EVENT",
  });
  assert.equal(
    seasonCardMismatch(rt, ev({ excludeSeasonCards: true })),
    "Seizoenskaarten gelden niet voor dit duel.",
  );
  assert.deepEqual(evaluateScan(rt, ev({ isHome: false }), 0, NOW), {
    result: "INVALID",
    reason: "WRONG_EVENT",
  });
  assert.equal(
    seasonCardMismatch(rt, ev({ seasonId: "s2" }), (id) =>
      id === "s1" ? "2026/2027" : null,
    ),
    "Deze kaart geldt voor seizoen 2026/2027.",
  );
  assert.deepEqual(evaluateScan(rt, ev({ status: "CANCELLED" }), 0, NOW), {
    result: "INVALID",
    reason: "EVENT_NOT_ACTIVE",
  });
});

test("bij meerdere treffers telt eerst een geldige kaart van het seizoen van het duel", () => {
  const hits = [
    { id: "a", status: "VALID", seasonId: "s0" },
    { id: "b", status: "INVALID", seasonId: "s1" },
    { id: "c", status: "VALID", seasonId: "s1" },
  ];
  assert.equal(pickSeasonCard(hits, "s1")?.id, "c");
  assert.equal(pickSeasonCard(hits.slice(0, 2), "s1")?.id, "b");
  assert.equal(pickSeasonCard(hits.slice(0, 1), "s1")?.id, "a");
  assert.equal(pickSeasonCard([], "s1"), null);
});

test("aanwezigheid: een Fullhouse-kaart telt pas vanaf het verkoopmoment", () => {
  const card = fullhouseCardRow(
    { id: "x", soldAt: new Date("2026-10-01T10:00:00Z") },
    "s1",
  );
  const before = {
    id: "e0",
    title: "Vroeg",
    startsAt: new Date("2026-09-01T12:30:00Z"),
    endsAt: new Date("2026-09-01T18:30:00Z"),
    status: "ACTIVE",
    seasonId: "s1",
    competition: null,
    isHome: true,
    allowReentry: true,
  };
  const after = {
    ...before,
    id: "e1",
    startsAt: new Date("2026-11-01T13:30:00Z"),
    endsAt: new Date("2026-11-01T19:30:00Z"),
  };
  assert.equal(gameState(card, before, false, NOW), "NOT_ISSUED");
  assert.equal(gameState(card, after, false, NOW), "MISSED");
  assert.equal(gameState(card, after, true, NOW), "ATTENDED");
  assert.equal(
    gameState(
      fullhouseCardRow({ id: "y", soldAt: null }, "s1"),
      before,
      false,
      NOW,
    ),
    "MISSED",
  );
  assert.equal(
    gameState(card, { ...after, excludeSeasonCards: true }, false, NOW),
    "EXCLUDED",
  );
});

test("offline: Fullhouse-seizoenskaart met herintrede mag opnieuw naar binnen, een losse kaart niet", () => {
  const cache: OfflineCache = {
    event: { id: "e1", title: "Duel" },
    generatedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
    hhc: [],
    fullhouse: [
      { h: "seizoen", l: "A. Jansen · Seizoenskaart", r: true },
      { h: "los", l: "B. Bakker · Reguliere toegang" },
    ],
    used: [
      { k: "seizoen", at: new Date(NOW.getTime() - 3600_000).toISOString() },
      { k: "los", at: new Date(NOW.getTime() - 3600_000).toISOString() },
    ],
  };
  const s = checkOffline(cache, "x", "seizoen", new Map(), null, NOW);
  assert.equal(s.result, "VALID");
  assert.equal(s.reentry, true);
  assert.equal(
    checkOffline(cache, "x", "los", new Map(), null, NOW).result,
    "WARNING",
  );
});
