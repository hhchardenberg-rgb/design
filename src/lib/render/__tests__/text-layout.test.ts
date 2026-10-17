import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutText, fontString, drawTextLayout, type TextLayoutInput, type MeasureText, type TextCanvas } from "../textLayout";
import { BUILTIN_FONT_FACES, resolveFontFace, type FontFaceInfo } from "@/lib/fonts/faces";
import { resolveLayerText } from "../textLayer";
import type { TextLayer } from "@/lib/validations/template";

// Vaste meting: elk teken is 0,5 em breed. Maakt de regels voorspelbaar.
const measure: MeasureText = (text, font) => {
  const size = Number(/ (\d+(?:\.\d+)?)px /.exec(font)![1]);
  return [...text].length * size * 0.5;
};

const face = { alias: "test", weight: 400, style: "normal" as const, ascent: 0.8, descent: 0.2 };
const base: TextLayoutInput = {
  text: "",
  width: 200,
  height: 100,
  face,
  fontSize: 40,
  minFontSize: 10,
  maxLines: 1,
  lineHeight: 1,
  letterSpacing: 0,
  align: "left",
  verticalAlign: "top",
  allowTruncate: false,
};

test("tekst die past blijft op de startgrootte, baseline uit de metrics", () => {
  const l = layoutText({ ...base, text: "ABCDEFGHIJ" }, measure); // 10 × 20 = 200
  assert.equal(l.fontSize, 40);
  assert.equal(l.lines.length, 1);
  assert.equal(l.lines[0].x, 0);
  // regelhoogte 40, inhoud (0,8+0,2)·40 = 40 → baseline = 0,8·40
  assert.equal(l.lines[0].baseline, 32);
  assert.equal(l.overflow, false);
  assert.equal(l.font, fontString(face, 40));
});

test("verkleint stapsgewijs tot het past", () => {
  const l = layoutText({ ...base, text: "ABCDEFGHIJKLMNOPQRST" }, measure); // 20 tekens
  assert.equal(l.fontSize, 20);
  assert.equal(l.overflow, false);
});

test("letterafstand telt mee tussen tekens, niet na het laatste", () => {
  const l = layoutText({ ...base, text: "ABCDEFGHIJ", letterSpacing: 2 }, measure);
  // 40px: 200 + 9·2 = 218 > 200; 39px: 195 + 18 = 213; ... 36px: 180+18=198
  assert.equal(l.fontSize, 36);
  assert.equal(l.lines[0].width, 198);
});

test("woordafbreking over meerdere regels en regeleinden blijven staan", () => {
  const l = layoutText({ ...base, text: "AAAA BBBB\nCC", fontSize: 20, maxLines: 3, height: 100 }, measure);
  assert.deepEqual(l.lines.map((x) => x.text), ["AAAA BBBB", "CC"]);
  const wrapped = layoutText({ ...base, text: "AAAAAAAA BBBBBBBB", fontSize: 40, minFontSize: 40, maxLines: 2 }, measure);
  assert.deepEqual(wrapped.lines.map((x) => x.text), ["AAAAAAAA", "BBBBBBBB"]);
  assert.equal(wrapped.lines[1].baseline - wrapped.lines[0].baseline, 40);
});

test("past niet: overflow zonder afkappen, met allowTruncate een beletselteken", () => {
  const input = { ...base, text: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", minFontSize: 20 };
  const over = layoutText(input, measure);
  assert.equal(over.overflow, true);
  assert.equal(over.truncated, false);
  assert.equal(over.fontSize, 20);
  const cut = layoutText({ ...input, allowTruncate: true }, measure);
  assert.equal(cut.overflow, false);
  assert.equal(cut.truncated, true);
  assert.ok(cut.lines[0].text.endsWith("…"));
  assert.ok(cut.lines[0].width <= 200);
});

test("horizontale en verticale uitlijning", () => {
  const center = layoutText({ ...base, text: "AB", align: "center", verticalAlign: "middle" }, measure);
  assert.equal(center.lines[0].x, (200 - 40) / 2);
  assert.equal(center.lines[0].baseline, 30 + 32);
  const right = layoutText({ ...base, text: "AB", align: "right", verticalAlign: "bottom" }, measure);
  assert.equal(right.lines[0].x, 160);
  assert.equal(right.lines[0].baseline, 60 + 32);
});

test("lege tekst geeft geen regels", () => {
  assert.equal(layoutText({ ...base, text: "   " }, measure).lines.length, 0);
});

test("tekenen: omlijning onder de vulling, beide op dezelfde posities", () => {
  const calls: string[] = [];
  const ctx = {
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1,
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    letterSpacing: "0px",
    save() {},
    restore() {},
    fillText(t: string, x: number, y: number) {
      calls.push(`fill ${t} ${x} ${y}`);
    },
    strokeText(t: string, x: number, y: number) {
      calls.push(`stroke ${t} ${x} ${y} w${this.lineWidth}`);
    },
    measureText: (t: string) => ({ width: t.length }),
  } satisfies TextCanvas;
  const layout = layoutText({ ...base, text: "AB" }, measure);
  drawTextLayout(ctx, layout, { color: "#fff", stroke: { color: "#000", width: 3 } });
  assert.deepEqual(calls, ["stroke AB 0 32 w6", "fill AB 0 32"]);
});

const face400 = (over: Partial<FontFaceInfo>): FontFaceInfo => ({
  ...BUILTIN_FONT_FACES[0],
  builtin: false,
  ...over,
});

test("fontkeuze: vastgelegd, PostScript-naam, familie, vervanger, ontbrekend", () => {
  const dinBlack = face400({ id: "f1", alias: "hhcf-f1", family: "DIN Black", cssFamily: "FF DIN", subfamily: "Regular", postscriptName: "DIN-Black", weight: 900 });
  const dinBold = face400({ id: "f2", alias: "hhcf-f2", family: "DIN", cssFamily: "FF DIN", subfamily: "Bold", postscriptName: "DIN-Bold", weight: 700 });
  const off = face400({ id: "f3", alias: "hhcf-f3", family: "Oud", cssFamily: "Oud", postscriptName: "Oud-Regular", active: false });
  const faces = [dinBlack, dinBold, off];
  const ref = { fontFamily: "FF DIN", fontWeight: 700, fontStyle: "normal" as const };

  assert.equal(resolveFontFace({ ...ref, fontFaceId: "f3" }, faces).face.id, "f3"); // ook als uitgezet
  assert.equal(resolveFontFace({ ...ref, fontPostscriptName: "DIN-Black" }, faces).face.id, "f1");
  assert.equal(resolveFontFace({ ...ref, fontPostscriptName: "Oud-Regular" }, faces).status, "matched"); // uitgezet telt niet
  assert.deepEqual(
    [resolveFontFace(ref, faces).face.id, resolveFontFace(ref, faces).status],
    ["f2", "matched"]
  );
  const sub = resolveFontFace({ ...ref, fontWeight: 500 }, faces);
  assert.equal(sub.status, "substitute");
  assert.equal(sub.face.id, "f2");
  const missing = resolveFontFace({ fontFamily: "Gotham", fontWeight: 700, fontStyle: "normal" }, faces);
  assert.equal(missing.status, "missing");
  assert.equal(missing.face.id, "builtin-inter-700");
  assert.equal(resolveFontFace({ fontFamily: "Inter", fontWeight: 600, fontStyle: "normal" }, []).face.id, "builtin-inter-600");
});

test("tekst van een laag: voorbeeldtekst, leeg, transformatie en hoofdletters", () => {
  const layer = { field: "t", text: "voorbeeld", uppercase: false } as TextLayer;
  assert.equal(resolveLayerText(layer, {}, "NONE"), "voorbeeld");
  assert.equal(resolveLayerText(layer, { t: "" }, "NONE"), "");
  assert.equal(resolveLayerText(layer, { t: "ijsselmeer" }, "CAPITALIZE"), "IJsselmeer");
  assert.equal(resolveLayerText({ ...layer, uppercase: true }, { t: "één" }), "ÉÉN");
});

test("Photoshop-basislijn: exact op de plek, ongeacht de lettertypemetriek", () => {
  const anchor = { y: 50, lines: 1, fontSize: 40 };
  for (const metrics of [{ ascent: 0.8, descent: 0.2 }, { ascent: 0.95, descent: 0.3 }]) {
    for (const verticalAlign of ["top", "middle", "bottom"] as const) {
      const l = layoutText({ ...base, face: { ...face, ...metrics }, verticalAlign, text: "ABC", anchor }, measure);
      assert.equal(Math.round(l.lines[0].baseline * 1000) / 1000, 50);
    }
  }
  // Twee regels waar Photoshop er één had: het blok schuift evenveel mee.
  const two = layoutText({ ...base, maxLines: 2, verticalAlign: "top", text: "ABC\nDEF", anchor }, measure);
  assert.deepEqual(two.lines.map((l) => l.baseline), [50, 90]);
});
