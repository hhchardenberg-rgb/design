import { test } from "node:test";
import assert from "node:assert/strict";
import { textLayerFromPsd, unrotateBox, weightFromName } from "../text";

const box = { key: "opponent", name: "Tegenstander", left: 100, top: 200, width: 400, height: 60 };

test("lettergrootte en kader nemen de schaal uit de PSD-transform mee", () => {
  const { layer, warnings } = textLayerFromPsd(box, {
    name: "TEXT:opponent",
    text: {
      text: "FC Voorbeeld",
      transform: [2, 0, 0, 2, 100, 200],
      shapeType: "box",
      boxBounds: [0, 0, 200, 30],
      style: { fontSize: 24, font: { name: "DIN-Black" }, fillColor: { r: 255, g: 255, b: 255 }, fontCaps: 2, tracking: 50 },
      paragraphStyle: { justification: "center" },
    },
  });
  assert.equal(layer.fontSize, 48);
  assert.equal(layer.width, 400);
  assert.equal(layer.height, 60);
  assert.equal(layer.x, 100);
  assert.equal(layer.y, 200);
  assert.equal(layer.rotation, 0);
  assert.equal(layer.fontPostscriptName, "DIN-Black");
  assert.equal(layer.fontWeight, 900);
  assert.equal(layer.uppercase, true);
  assert.equal(layer.align, "center");
  assert.equal(layer.color, "#FFFFFF");
  assert.equal(layer.letterSpacing, 2.4);
  assert.deepEqual(warnings, []);
});

test("rotatie uit de transform; het kader blijft het niet-gedraaide kader", () => {
  const a = (10 * Math.PI) / 180;
  const { layer } = textLayerFromPsd(box, {
    text: {
      text: "Uitslag",
      transform: [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 300, 230],
      shapeType: "box",
      boxBounds: [-100, -15, 100, 15],
      style: { fontSize: 30 },
    },
  });
  assert.equal(layer.rotation, 10);
  assert.equal(layer.width, 200);
  // 30 px kader, maar één regel van 30 px × 1,2: het kader groeit rond het midden.
  assert.equal(layer.height, 36);
  // midden van het kader = (300, 230)
  assert.equal(layer.x + layer.width / 2, 300);
  assert.equal(layer.y + layer.height / 2, 230);
});

test("waarschuwingen voor wat niet wordt nagebootst; effecten omlijning en schaduw", () => {
  const { layer, warnings } = textLayerFromPsd(box, {
    name: "TEXT:opponent",
    text: {
      text: "AB",
      warp: { style: "arc" },
      styleRuns: [
        { length: 1, style: { fontSize: 20, font: { name: "DIN-Bold" } } },
        { length: 1, style: { fontSize: 30, font: { name: "DIN-Bold" } } },
      ],
      style: { fauxBold: true },
    },
    effects: {
      stroke: [{ enabled: true, size: { units: "Pixels", value: 3 }, color: { r: 0, g: 0, b: 0 }, position: "outside", opacity: 1 }],
      dropShadow: [{ enabled: true, size: { units: "Pixels", value: 8 }, distance: { units: "Pixels", value: 10 }, angle: 90, color: { r: 0, g: 0, b: 0 }, opacity: 0.5 }],
    },
  });
  assert.ok(warnings.some((w) => w.includes("warp")));
  assert.ok(warnings.some((w) => w.includes("verschillende")));
  assert.deepEqual(layer.stroke, { color: "#000000", width: 3 });
  assert.equal(layer.shadow?.color, "rgba(0, 0, 0, 0.5)");
  assert.equal(layer.shadow?.offsetY, 10);
  assert.equal(Math.abs(layer.shadow!.offsetX), 0);
});

test("puntentekst krijgt marge; gewicht en cursief uit de PostScript-naam", () => {
  const { layer } = textLayerFromPsd(box, { text: { text: "x", style: { fontSize: 40, font: { name: "DIN-MediumItalic" } } } });
  assert.ok(layer.width > box.width);
  assert.equal(layer.fontWeight, 500);
  assert.equal(layer.fontStyle, "italic");
  assert.deepEqual(weightFromName("Inter-SemiBold"), { weight: 600, italic: false });
  assert.deepEqual(weightFromName("Gotham-Book"), { weight: 400, italic: false });
});

test("niet-gedraaid kader terugrekenen uit de omhullende", () => {
  const a = (20 * Math.PI) / 180;
  const W = 200 * Math.cos(a) + 50 * Math.sin(a);
  const H = 200 * Math.sin(a) + 50 * Math.cos(a);
  const r = unrotateBox(W, H, 20)!;
  assert.ok(Math.abs(r.width - 200) < 0.01 && Math.abs(r.height - 50) < 0.01);
  assert.equal(unrotateBox(100, 100, 45), null);
});
