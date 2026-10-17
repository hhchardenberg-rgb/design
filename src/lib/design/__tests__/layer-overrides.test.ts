import { test } from "node:test";
import assert from "node:assert/strict";
import type { TemplateSchemaJson } from "@/lib/validations/template";
import { applyLayerOverrides, normalizeLayerOverrides, LAYER_OVERRIDES_KEY } from "../layer-overrides";
import { normalizeFormData } from "../form-data";

const schema = {
  width: 1000,
  height: 1000,
  layers: [
    {
      id: "naam",
      type: "text",
      field: "naam",
      x: 100,
      y: 100,
      width: 400,
      height: 80,
      fontFamily: "Inter",
      fontWeight: 700,
      fontStyle: "normal",
      fontSize: 60,
      minFontSize: 20,
      color: "#FFFFFF",
      align: "left",
      uppercase: false,
      letterSpacing: 0,
      lineHeight: 1.2,
      maxLines: 1,
      allowTruncate: false,
      psdBaseline: { y: 60, lines: 1, fontSize: 60 },
      allow: ["move", "color", "fontSize"],
    },
    { id: "foto", type: "image", field: "foto", x: 0, y: 0, width: 500, height: 500, fit: "cover", shape: "rect", cornerRadius: 0 },
  ],
} as unknown as TemplateSchemaJson;

const colors = new Set(["#FFFFFF", "#FF6F00"]);

test("laagaanpassingen: alleen wat de builder toestaat, binnen grenzen", () => {
  const ok = normalizeLayerOverrides(schema, { naam: { x: 5000, y: 50, color: "#ff6f00", fontSize: 500 } }, colors);
  assert.deepEqual(ok, { naam: { x: 1000, y: 50, color: "#FF6F00", fontSize: 90 } });
  assert.throws(() => normalizeLayerOverrides(schema, { naam: { width: 10 } }, colors), /formaat/);
  assert.throws(() => normalizeLayerOverrides(schema, { naam: { align: "center" } }, colors), /uitlijning/);
  assert.throws(() => normalizeLayerOverrides(schema, { foto: { x: 1 } }, colors), /positie/);
  assert.throws(() => normalizeLayerOverrides(schema, { naam: { color: "#123456" } }, colors), /huisstijl/);
  assert.throws(() => normalizeLayerOverrides(schema, { onbekend: { x: 1 } }, colors), /Onbekende laag/);
});

test("toepassen in preview en export: zelfde schema, basislijn blijft bij verplaatsen", () => {
  const out = applyLayerOverrides(schema, { [LAYER_OVERRIDES_KEY]: { naam: { x: 300, color: "#FF6F00", fontSize: 40, width: 999 } } });
  const naam = out.layers[0] as Extract<TemplateSchemaJson["layers"][number], { type: "text" }>;
  assert.equal(naam.x, 300);
  assert.equal(naam.width, 400, "formaat niet toegestaan: genegeerd");
  assert.equal(naam.color, "#FF6F00");
  assert.equal(naam.fontSize, 40);
  assert.ok(naam.psdBaseline);
  assert.equal(applyLayerOverrides(schema, {}), schema);
});

test("formData: __layers wordt via het schema gecontroleerd", () => {
  const fields = [{ key: "naam", label: "Naam", type: "SHORT_TEXT", required: false, maxLength: null, defaultValue: null, options: null }];
  const out = normalizeFormData(fields, { naam: "Jan", __layers: { naam: { y: 200 } } }, { allowedColors: colors, schema });
  assert.deepEqual(out.__layers, { naam: { y: 200 } });
  assert.throws(() => normalizeFormData(fields, { __layers: { naam: { y: 1 } } }, { allowedColors: colors }));
});
