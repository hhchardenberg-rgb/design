import { test } from "node:test";
import assert from "node:assert/strict";
import { writePsdBuffer, type Layer, type Psd } from "ag-psd";
import sharp from "sharp";
import { importPsd, PsdImportError, ASSET_PREFIX } from "../parse";
import { composeLayers, createBuffer, toRgba8 } from "../compose";

const W = 200;
const H = 100;

function rect(w: number, h: number, rgba: [number, number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { width: w, height: h, data };
}

function layer(name: string, left: number, top: number, w: number, h: number, rgba: [number, number, number, number], extra: Partial<Layer> = {}): Layer {
  return { name, left, top, right: left + w, bottom: top + h, imageData: rect(w, h, rgba), ...extra };
}

/** Bouwt een PSD; de samengestelde afbeelding wordt met de eigen compositor gemaakt. */
function buildPsd(children: Layer[], withComposite = true, size = { w: W, h: H }): Buffer {
  const psd: Psd = { width: size.w, height: size.h, children };
  if (withComposite) {
    const buf = createBuffer(size.w, size.h);
    composeLayers(buf, children);
    psd.imageData = { width: size.w, height: size.h, data: new Uint8ClampedArray(toRgba8(buf)) };
  }
  return Buffer.from(writePsdBuffer(psd, { generateThumbnail: false, noBackground: true }));
}

test("een foto tussen vaste lagen blijft tussen die lagen liggen", async () => {
  const buffer = buildPsd([
    layer("Achtergrond", 0, 0, W, H, [255, 111, 0, 255]),
    layer("Band", 0, 40, W, 20, [0, 0, 0, 255]),
    layer("IMAGE:speler", 20, 10, 60, 80, [128, 128, 128, 255]),
    layer("Rand", 60, 0, 40, H, [255, 255, 255, 255]),
    layer("TEXT:tegenstander", 120, 20, 70, 30, [0, 0, 0, 255], {
      hidden: true,
      text: { text: "FC Voorbeeld", transform: [1, 0, 0, 1, 120, 40], style: { fontSize: 20, font: { name: "DIN-Black" } } },
    }),
    { name: "VISIBILITY:thuis", opened: true, children: [layer("Thuislabel", 150, 70, 40, 20, [0, 128, 0, 255])] },
  ]);
  const result = await importPsd(buffer);
  const kinds = result.schema.layers.map((l) => `${l.type}:${l.id}`);
  assert.deepEqual(kinds, ["background:background", "image:speler", "static_image:static_1", "text:tegenstander", "static_image:visibility_thuis"]);

  const rand = result.schema.layers[2];
  assert.deepEqual([rand.x, rand.y, rand.width, rand.height], [60, 0, 40, H], "segment bijgesneden tot zijn inhoud");
  assert.equal((rand as { src: string }).src, `${ASSET_PREFIX}segment-1`);
  assert.ok(result.images["segment-1"] && result.images.background && result.images.reference && result.images.diff);
  assert.equal((result.schema.layers[1] as { placeholderSrc?: string }).placeholderSrc, `${ASSET_PREFIX}placeholder-speler`);

  // Achtergrond bevat band, maar niet de rand (die ligt boven de foto).
  const { data } = await sharp(result.images.background).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => Array.from(data.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
  assert.deepEqual(at(5, 50), [0, 0, 0, 255]);
  assert.deepEqual(at(70, 5), [255, 111, 0, 255]);

  assert.deepEqual(result.fields.map((f) => f.key), ["speler", "tegenstander", "thuis"]);
  assert.equal(result.report.backgroundSource, "composed");
  assert.ok(result.report.match && result.report.match.changedRatio < 0.01, JSON.stringify(result.report.match));
  assert.ok(result.report.stackMatch.changedRatio < 0.01, JSON.stringify(result.report.stackMatch));
  assert.ok(result.report.layers.some((l) => l.kind === "text" && l.notes.includes("verborgen in Photoshop")));
});

test("Photoshop-samenstelling wordt alleen achtergrond als er aantoonbaar niets anders in zit", async () => {
  const hiddenOnly = await importPsd(
    buildPsd([
      layer("Achtergrond", 0, 0, W, H, [10, 20, 30, 255]),
      layer("IMAGE:foto", 0, 0, 50, 50, [128, 128, 128, 255], { hidden: true }),
    ])
  );
  assert.equal(hiddenOnly.report.backgroundSource, "photoshop");
  const foto = hiddenOnly.schema.layers.find((l) => l.id === "foto") as { placeholderSrc?: string };
  assert.equal(foto.placeholderSrc, undefined, "verborgen fotolaag geeft geen voorbeeldbeeld");

  const visible = await importPsd(
    buildPsd([
      layer("Achtergrond", 0, 0, W, H, [10, 20, 30, 255]),
      layer("IMAGE:foto", 0, 0, 50, 50, [128, 128, 128, 255]),
    ])
  );
  assert.equal(visible.report.backgroundSource, "composed");

  const noComposite = await importPsd(
    buildPsd([layer("Achtergrond", 0, 0, W, H, [10, 20, 30, 255]), layer("Vlak", 0, 0, 20, 20, [200, 0, 0, 255])], false)
  );
  assert.equal(noComposite.report.compositeAvailable, false);
  assert.equal(noComposite.report.match, null);
});

test("lege fotolaag krijgt de hele afbeelding als kader", async () => {
  const result = await importPsd(
    buildPsd([
      layer("Achtergrond", 0, 0, W, H, [0, 0, 0, 255]),
      { name: "IMAGE: foto", opened: true, children: [{ name: "IMAGE: foto" }] },
    ])
  );
  const foto = result.schema.layers.find((l) => l.id === "foto") as { x: number; y: number; width: number; height: number };
  assert.deepEqual([foto.x, foto.y, foto.width, foto.height], [0, 0, W, H]);
  assert.ok(result.report.issues.some((i) => i.message.includes("is leeg")));
});

test("afwijking van Photoshop wordt gemeten en blokkeert boven 15%", async () => {
  const psd: Psd = { width: W, height: H, children: [layer("Achtergrond", 0, 0, W, H, [0, 0, 0, 255])] };
  psd.imageData = rect(W, H, [255, 255, 255, 255]); // samenstelling klopt niet
  const result = await importPsd(Buffer.from(writePsdBuffer(psd, { generateThumbnail: false, noBackground: true })));
  assert.ok(result.report.match!.changedRatio > 0.99);
  assert.ok(result.report.issues.some((i) => i.severity === "error"));
});

test("grenzen: te groot document wordt geweigerd", async () => {
  await assert.rejects(importPsd(buildPsd([], false, { w: 9000, h: 10 })), PsdImportError);
  await assert.rejects(importPsd(Buffer.from("geen psd")), PsdImportError);
});
