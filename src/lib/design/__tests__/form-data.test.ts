import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFormData, missingRequiredFields, stableStringify, type ValidationField } from "../form-data";
import { applyTextTransform } from "@/lib/render/textTransform";

const f = (key: string, type: string, extra: Partial<ValidationField> = {}): ValidationField => ({
  key,
  label: key,
  type,
  required: false,
  maxLength: null,
  defaultValue: null,
  options: null,
  ...extra,
});

const fields = [
  f("opponent", "SHORT_TEXT", { maxLength: 20, required: true }),
  f("body", "LONG_TEXT"),
  f("score_home", "SCORE"),
  f("kind", "DROPDOWN", { options: [{ label: "Thuis", value: "home" }, { label: "Uit", value: "away" }] }),
  f("show_sponsor", "CHECKBOX"),
  f("accent", "BRAND_COLOR"),
  f("photo", "IMAGE", { required: true }),
];
const opts = { allowedColors: new Set(["#FF6F00", "#111111"]) };

test("formData: geldige invoer wordt genormaliseerd", () => {
  const out = normalizeFormData(
    fields,
    {
      opponent: "Sparta Nijkerk",
      body: "Regel 1\nRegel 2",
      score_home: 0,
      kind: "away",
      show_sponsor: "false",
      accent: "#ff6f00",
      photo: { asset: { kind: "upload", id: "abc" }, panX: 10, panY: -5, scale: 1.2 },
    },
    opts
  );
  assert.equal(out.score_home, "0", "0 blijft 0 en wordt niet als leeg gezien");
  assert.equal(out.show_sponsor, false);
  assert.equal(out.accent, "#FF6F00");
  assert.equal(out.body, "Regel 1\nRegel 2", "handmatige regeleinden in lange tekst blijven staan");
});

test("formData: score leeg is iets anders dan 0", () => {
  assert.equal(normalizeFormData(fields, { score_home: "" }, opts).score_home, "");
  assert.throws(() => normalizeFormData(fields, { score_home: "-1" }, opts), /score/);
  assert.throws(() => normalizeFormData(fields, { score_home: "1e3" }, opts));
  assert.throws(() => normalizeFormData(fields, { score_home: "Infinity" }, opts));
});

test("formData: onbekende velden, te lange tekst, keuzes en kleuren worden geweigerd", () => {
  assert.throws(() => normalizeFormData(fields, { layout: { x: 0 } }, opts), /Onbekend veld/);
  assert.throws(() => normalizeFormData(fields, { opponent: "x".repeat(21) }, opts), /maximaal 20/);
  assert.throws(() => normalizeFormData(fields, { opponent: "a\nb" }, opts), /regeleinden/);
  assert.throws(() => normalizeFormData(fields, { kind: "neutral" }, opts), /keuze/);
  assert.throws(() => normalizeFormData(fields, { accent: "#123456" }, opts), /huisstijl/);
  assert.throws(() => normalizeFormData(fields, { accent: "red" }, opts), /kleur/);
  assert.throws(() => normalizeFormData(fields, { photo: { assetUrl: "x", x: 1 } }, opts), /afbeelding/);
  assert.throws(() => normalizeFormData(fields, { photo: { scale: Number.NaN } }, opts));
  assert.throws(() => normalizeFormData(fields, [], opts));
});

test("formData: accenten en lange clubnamen tellen per teken", () => {
  const out = normalizeFormData(fields, { opponent: "Ééngooi ’t Zand" }, opts);
  assert.equal(out.opponent, "Ééngooi ’t Zand");
});

test("formData: verplichte velden pas bij export", () => {
  const missing = missingRequiredFields(fields, { opponent: " ", photo: {} });
  assert.deepEqual(missing.map((m) => m.key), ["opponent", "photo"]);
  assert.deepEqual(missingRequiredFields(fields, { opponent: "A", photo: { assetUrl: "/x.png" } }), []);
});

test("stableStringify is onafhankelijk van sleutelvolgorde", () => {
  assert.equal(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] }), stableStringify({ a: [1, { c: 3, d: 2 }], b: 1 }));
});

test("teksttransformatie: Nederlands, accenten en regeleinden", () => {
  assert.equal(applyTextTransform("één\ntwee", "UPPERCASE"), "ÉÉN\nTWEE");
  assert.equal(applyTextTransform("VV ÉÉNHOORN", "LOWERCASE"), "vv éénhoorn");
  assert.equal(applyTextTransform("ajax-amsterdam o19 ‘de ster’", "CAPITALIZE"), "Ajax-Amsterdam O19 ‘De Ster’");
  assert.equal(applyTextTransform("ongewijzigd", "NONE"), "ongewijzigd");
});
