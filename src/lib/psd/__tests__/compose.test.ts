import { test } from "node:test";
import assert from "node:assert/strict";
import type { Layer } from "ag-psd";
import { composeLayers, createBuffer, diffBuffers, alphaBounds } from "../compose";

function solid(w: number, h: number, rgba: [number, number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { width: w, height: h, data };
}

const px = (buf: ReturnType<typeof createBuffer>, x: number, y: number) =>
  Array.from(buf.data.slice((y * buf.width + x) * 4, (y * buf.width + x) * 4 + 4)).map((v) => Math.round(v * 255));

test("normaal stapelen met dekking en bijsnijden buiten het canvas", () => {
  const dst = createBuffer(10, 10);
  composeLayers(dst, [
    { name: "rood", left: 0, top: 0, imageData: solid(10, 10, [255, 0, 0, 255]) },
    // Laag deels links/boven buiten het canvas: wordt bijgesneden, niet verschoven.
    { name: "blauw", left: -5, top: -5, opacity: 0.5, imageData: solid(8, 8, [0, 0, 255, 255]) },
  ] as Layer[]);
  assert.deepEqual(px(dst, 0, 0), [128, 0, 128, 255]);
  assert.deepEqual(px(dst, 2, 2), [128, 0, 128, 255]);
  assert.deepEqual(px(dst, 3, 3), [255, 0, 0, 255], "blauw eindigt op x=2");
});

test("overvloeimodi vermenigvuldigen en bleken", () => {
  const dst = createBuffer(2, 1);
  composeLayers(dst, [
    { left: 0, top: 0, imageData: solid(2, 1, [200, 100, 50, 255]) },
    { left: 0, top: 0, blendMode: "multiply", imageData: solid(1, 1, [128, 128, 128, 255]) },
    { left: 1, top: 0, blendMode: "screen", imageData: solid(1, 1, [128, 128, 128, 255]) },
  ] as Layer[]);
  assert.deepEqual(px(dst, 0, 0), [100, 50, 25, 255]);
  assert.deepEqual(px(dst, 1, 0), [228, 178, 153, 255]);
});

test("laagmasker en uitknipmasker", () => {
  const dst = createBuffer(4, 1);
  const mask = solid(2, 1, [0, 0, 0, 255]); // zwart = verbergen
  composeLayers(dst, [
    { name: "basis", left: 0, top: 0, imageData: solid(2, 1, [255, 255, 255, 255]) },
    { name: "geknipt", left: 0, top: 0, clipping: true, imageData: solid(4, 1, [0, 255, 0, 255]) },
    { name: "gemaskeerd", left: 2, top: 0, mask: { left: 2, top: 0, defaultColor: 255, imageData: mask }, imageData: solid(2, 1, [255, 0, 0, 255]) },
  ] as Layer[]);
  assert.deepEqual(px(dst, 0, 0), [0, 255, 0, 255], "uitgeknipt binnen de basis");
  assert.deepEqual(px(dst, 2, 0)[3], 0, "buiten de basis niets, en het masker verbergt rood");
});

test("groep met eigen dekking wordt als geheel samengevoegd", () => {
  const dst = createBuffer(1, 1);
  composeLayers(dst, [
    { left: 0, top: 0, imageData: solid(1, 1, [0, 0, 0, 255]) },
    {
      name: "groep",
      blendMode: "normal",
      opacity: 0.5,
      children: [
        { left: 0, top: 0, imageData: solid(1, 1, [255, 255, 255, 255]) },
        { left: 0, top: 0, imageData: solid(1, 1, [255, 255, 255, 255]) },
      ],
    },
  ] as Layer[]);
  // Als geheel: 50% wit over zwart (niet 75% zoals bij losse lagen).
  assert.deepEqual(px(dst, 0, 0), [128, 128, 128, 255]);
});

test("verborgen lagen en meldingen voor wat niet wordt nagebootst", () => {
  const dst = createBuffer(1, 1);
  const issues: { layer: string; message: string }[] = [];
  composeLayers(
    dst,
    [
      { name: "weg", hidden: true, left: 0, top: 0, imageData: solid(1, 1, [255, 0, 0, 255]) },
      { name: "gloed", left: 0, top: 0, effects: { outerGlow: { enabled: true } }, imageData: solid(1, 1, [0, 0, 255, 255]) },
      { name: "aanpassing", adjustment: { type: "brightness/contrast" } },
    ] as Layer[],
    { issues }
  );
  assert.deepEqual(px(dst, 0, 0), [0, 0, 255, 255]);
  assert.deepEqual(issues.map((i) => i.layer), ["gloed", "aanpassing"]);
});

test("slagschaduw onder de laag, verschoven over de lichthoek", () => {
  const shadow = (size: number) => ({
    enabled: true,
    blendMode: "normal" as const,
    color: { r: 255, g: 0, b: 0 },
    opacity: 1,
    angle: 90,
    distance: { units: "Pixels" as const, value: 4 },
    size: { units: "Pixels" as const, value: size },
  });
  const issues: { layer: string; message: string }[] = [];
  const sharp = createBuffer(20, 20);
  composeLayers(sharp, [{ name: "blok", left: 8, top: 8, effects: { dropShadow: [shadow(0)] }, imageData: solid(4, 4, [0, 0, 0, 255]) }] as Layer[], { issues });
  assert.deepEqual(issues, [], "slagschaduw wordt nagebootst, geen melding");
  assert.deepEqual(px(sharp, 9, 9), [0, 0, 0, 255], "de laag zelf ligt erboven");
  assert.deepEqual(px(sharp, 9, 13), [255, 0, 0, 255], "licht van boven: schaduw eronder");
  assert.equal(px(sharp, 9, 6)[3], 0, "niets boven de laag");

  const soft = createBuffer(20, 20);
  composeLayers(soft, [{ name: "blok", left: 8, top: 8, effects: { dropShadow: [shadow(6)] }, imageData: solid(4, 4, [0, 0, 0, 255]) }] as Layer[]);
  const a = px(soft, 9, 16)[3];
  assert.ok(a > 0 && a < 255, `vervaagde rand, alfa ${a}`);
});

test("verschilbeeld en kader van zichtbare pixels", () => {
  const a = createBuffer(4, 4);
  const b = createBuffer(4, 4);
  composeLayers(a, [{ left: 1, top: 1, imageData: solid(2, 2, [0, 0, 0, 255]) }] as Layer[]);
  composeLayers(b, [{ left: 1, top: 1, imageData: solid(2, 1, [0, 0, 0, 255]) }] as Layer[]);
  assert.deepEqual(alphaBounds(a), { left: 1, top: 1, width: 2, height: 2 });
  const d = diffBuffers(a, b);
  assert.equal(d.changedRatio, 2 / 16);
});
