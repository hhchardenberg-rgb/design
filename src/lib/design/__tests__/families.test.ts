import { test } from "node:test";
import assert from "node:assert/strict";
import { carryOverFormData, formatName, normalizeFamilyKey } from "../families";

test("formaatnaam: ingesteld of afgeleid van de verhouding", () => {
  assert.equal(formatName("Feed", 1080, 1350), "Feed");
  assert.equal(formatName(null, 1080, 1350), "Portret 4:5");
  assert.equal(formatName("", 1080, 1920), "Story 9:16");
  assert.equal(formatName(null, 1080, 1080), "Vierkant");
  assert.equal(formatName(null, 1000, 1700), "1000×1700");
});

test("familiesleutel wordt opgeschoond", () => {
  assert.equal(normalizeFamilyKey("  Wedstrijd   aankondiging "), "Wedstrijd aankondiging");
  assert.equal(normalizeFamilyKey("   "), null);
  assert.equal(normalizeFamilyKey(3), null);
});

test("invoer gaat mee naar een ander formaat waar de velden passen", () => {
  const from = {
    tegenstander: "Katwijk",
    foto: { asset: { kind: "upload", id: "u1" }, assetUrl: "https://x/u1.jpg", panX: 40, panY: -10, scale: 1.6 },
    kleur: "#FF6600",
    keuze: "a",
    alleen_hier: "weg",
    __layers: { tegenstander: { x: 10 } },
  };
  const fromFields = [
    { key: "tegenstander", type: "SHORT_TEXT" },
    { key: "foto", type: "IMAGE" },
    { key: "kleur", type: "BRAND_COLOR" },
    { key: "keuze", type: "DROPDOWN" },
    { key: "alleen_hier", type: "SHORT_TEXT" },
  ];
  const toFields = [
    { key: "tegenstander", type: "LONG_TEXT" },
    { key: "foto", type: "IMAGE" },
    { key: "kleur", type: "SHORT_TEXT" },
    { key: "keuze", type: "SHORT_TEXT" },
    { key: "nieuw", type: "SHORT_TEXT" },
  ];
  assert.deepEqual(carryOverFormData(from, fromFields, toFields), {
    tegenstander: "Katwijk",
    foto: { asset: { kind: "upload", id: "u1" }, assetUrl: "https://x/u1.jpg", panX: 0, panY: 0, scale: 1 },
  });
});
