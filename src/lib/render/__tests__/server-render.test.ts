import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { renderDesign, encodeCanvas, RenderError } from "../serverRender";
import { BUILTIN_FONT_FACES } from "@/lib/fonts/faces";
import { templateSchemaJson, type TemplateSchemaJson } from "@/lib/validations/template";

const faces = BUILTIN_FONT_FACES;

function schemaWith(text: Record<string, unknown>, extra: Partial<TemplateSchemaJson> = {}): TemplateSchemaJson {
  return templateSchemaJson.parse({
    width: 400,
    height: 200,
    backgroundColor: "#000000",
    ...extra,
    layers: [
      {
        id: "t",
        type: "text",
        field: "t",
        x: 50,
        y: 50,
        width: 300,
        height: 100,
        fontFamily: "Inter",
        fontWeight: 700,
        fontSize: 60,
        minFontSize: 30,
        color: "#FFFFFF",
        align: "center",
        ...text,
      },
    ],
  });
}

async function raw(canvas: Awaited<ReturnType<typeof renderDesign>>) {
  const { data, info } = await sharp(canvas.toBuffer("image/png")).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, channels: info.channels };
}

function inkBounds(img: { data: Buffer; width: number; channels: number }, threshold = 128) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < img.data.length; i += img.channels) {
    if (img.data[i] > threshold) {
      const p = i / img.channels;
      const x = p % img.width;
      const y = Math.floor(p / img.width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

test("tekst wordt met het meegeleverde Inter-bestand binnen het kader getekend", async () => {
  const canvas = await renderDesign(schemaWith({}), { t: "HHC" }, { strict: true, faces });
  const b = inkBounds(await raw(canvas));
  assert.ok(b.minX >= 50 && b.maxX <= 350, `x ${b.minX}-${b.maxX}`);
  assert.ok(b.minY >= 50 && b.maxY <= 150, `y ${b.minY}-${b.maxY}`);
  // Gecentreerd: links en rechts evenveel ruimte (binnen 3 px)
  assert.ok(Math.abs(b.minX - 50 - (350 - b.maxX)) <= 3, `centrering ${b.minX} ${b.maxX}`);
  // Hoofdletters van Inter (cap height ≈ 0,727 em) bij 60 px ≈ 44 px hoog
  assert.ok(Math.abs(b.maxY - b.minY + 1 - 44) <= 2, `hoogte ${b.maxY - b.minY + 1}`);
});

test("rotatie draait rond het midden van het kader, gelijk aan de preview", async () => {
  const canvas = await renderDesign(schemaWith({ rotation: 90, width: 200, x: 100, height: 60, y: 70, fontSize: 40, minFontSize: 10 }), { t: "HHCHHC" }, { strict: true, faces });
  const b = inkBounds(await raw(canvas));
  assert.ok(b.maxY - b.minY > b.maxX - b.minX, "gedraaide tekst is hoger dan breed");
});

test("strikte export weigert tekst die niet past, een ontbrekend font en ontbrekende tekens", async () => {
  await assert.rejects(
    renderDesign(schemaWith({ maxLines: 1 }), { t: "Dit is veel te lange tekst voor dit kleine kader" }, { strict: true, faces }),
    (e: unknown) => e instanceof RenderError && /past niet/.test((e as Error).message)
  );
  await assert.rejects(
    renderDesign(schemaWith({ fontFamily: "Gotham" }), { t: "HHC" }, { strict: true, faces }),
    (e: unknown) => e instanceof RenderError && /ontbreekt/.test((e as Error).message)
  );
  await assert.rejects(
    renderDesign(schemaWith({}), { t: "漢字" }, { strict: true, faces }),
    (e: unknown) => e instanceof RenderError && /tekens/.test((e as Error).message)
  );
  // Afkappen mag wel als de laag het toestaat.
  await renderDesign(schemaWith({ allowTruncate: true }), { t: "Dit is veel te lange tekst voor dit kleine kader" }, { strict: true, faces });
});

test("transparante achtergrond: PNG houdt alfa, JPG krijgt de achtergrondkleur", async () => {
  const schema = schemaWith({}, { transparent: true, backgroundColor: "#FF6F00" });
  const canvas = await renderDesign(schema, { t: "" }, { strict: true, faces });
  const png = await sharp(await encodeCanvas(canvas, "PNG", schema)).raw().toBuffer({ resolveWithObject: true });
  assert.equal(png.info.channels, 4);
  assert.equal(png.data[3], 0);
  const jpg = await sharp(await encodeCanvas(canvas, "JPG", schema)).raw().toBuffer({ resolveWithObject: true });
  assert.equal(jpg.info.channels, 3);
  assert.ok(Math.abs(jpg.data[0] - 0xff) <= 2 && Math.abs(jpg.data[1] - 0x6f) <= 3 && jpg.data[2] <= 3, `${jpg.data[0]},${jpg.data[1]},${jpg.data[2]}`);
  const meta = await sharp(await encodeCanvas(canvas, "WEBP", schema)).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.hasAlpha, true);
});
