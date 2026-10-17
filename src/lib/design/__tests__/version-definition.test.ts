import { test } from "node:test";
import assert from "node:assert/strict";
import { checkVersionDefinition } from "../template-versions.server";
import type { TemplateSchemaJson } from "@/lib/validations/template";

const schema = (layers: unknown[]) => ({ width: 100, height: 100, layers }) as unknown as TemplateSchemaJson;

test("PSD zonder achtergrond: lege achtergrondlaag is geen fout, lege vaste laag wel", () => {
  const empty = checkVersionDefinition(schema([{ id: "background", type: "background", x: 0, y: 0, width: 100, height: 100, src: "" }]), []);
  assert.deepEqual(empty.filter((i) => i.severity === "error"), []);
  const staticLayer = checkVersionDefinition(schema([{ id: "static_1", type: "static_image", x: 0, y: 0, width: 10, height: 10, src: "" }]), []);
  assert.ok(staticLayer.some((i) => i.severity === "error" && i.message.includes("geen afbeelding")));
});
