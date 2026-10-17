import { z } from "zod";
import type { Layer, LayerPermission, TemplateSchemaJson } from "@/lib/validations/template";

/**
 * Aanpassingen die een invuller zelf aan een laag doet, binnen wat de builder
 * per laag toestaat (Layer.allow): verplaatsen, schalen, tekstkleur,
 * lettergrootte en uitlijning. Ze staan in formData onder één sleutel, per
 * laag-id, en worden in preview én export op dezelfde manier toegepast.
 */
export const LAYER_OVERRIDES_KEY = "__layers";

const finite = z.number().finite();

export const layerOverrideSchema = z
  .object({
    x: finite.optional(),
    y: finite.optional(),
    width: finite.optional(),
    height: finite.optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    fontSize: finite.optional(),
    align: z.enum(["left", "center", "right"]).optional(),
  })
  .strict();
export type LayerOverride = z.infer<typeof layerOverrideSchema>;
export type LayerOverrides = Record<string, LayerOverride>;

export function allows(layer: Layer, permission: LayerPermission): boolean {
  return Boolean(layer.allow?.includes(permission));
}

/** Grenzen voor de lettergrootte die een invuller mag kiezen. */
export function fontSizeRange(layer: Extract<Layer, { type: "text" }>) {
  return { min: Math.max(1, Math.round(layer.minFontSize)), max: Math.round(layer.fontSize * 1.5) };
}

/**
 * Controleert de aanpassingen tegen het schema: alleen bestaande lagen, alleen
 * toegestane eigenschappen, binnen redelijke grenzen. Kleuren moeten bij de
 * huisstijl horen. Gooit een Error met een leesbare melding.
 */
export function normalizeLayerOverrides(schema: TemplateSchemaJson, raw: unknown, allowedColors: Set<string>): LayerOverrides {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Ongeldige laagaanpassingen.");
  const byId = new Map(schema.layers.map((l) => [l.id, l]));
  const out: LayerOverrides = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const layer = byId.get(id);
    if (!layer) throw new Error(`Onbekende laag "${id}".`);
    const parsed = layerOverrideSchema.safeParse(value);
    if (!parsed.success) throw new Error(`Ongeldige aanpassing van "${layer.name ?? id}".`);
    const o = parsed.data;
    const name = layer.name ?? id;
    const deny = (what: string): never => {
      throw new Error(`${what} van "${name}" mag niet worden aangepast.`);
    };
    const next: LayerOverride = {};
    if (o.x !== undefined || o.y !== undefined) {
      if (!allows(layer, "move") && !allows(layer, "resize")) deny("De positie");
    }
    if (o.width !== undefined || o.height !== undefined) {
      if (!allows(layer, "resize")) deny("Het formaat");
    }
    const w = o.width ?? layer.width;
    const h = o.height ?? layer.height;
    if (o.width !== undefined) next.width = clamp(o.width, 8, schema.width * 2);
    if (o.height !== undefined) next.height = clamp(o.height, 8, schema.height * 2);
    if (o.x !== undefined) next.x = clamp(o.x, -w, schema.width);
    if (o.y !== undefined) next.y = clamp(o.y, -h, schema.height);
    if (o.color !== undefined) {
      if (layer.type !== "text" || !allows(layer, "color")) deny("De kleur");
      const hex = o.color.toUpperCase();
      if (!allowedColors.has(hex)) throw new Error(`De kleur van "${name}" hoort niet bij de huisstijl.`);
      next.color = hex;
    }
    if (o.fontSize !== undefined) {
      if (layer.type !== "text" || !allows(layer, "fontSize")) deny("De lettergrootte");
      const range = fontSizeRange(layer as Extract<Layer, { type: "text" }>);
      next.fontSize = clamp(o.fontSize, range.min, range.max);
    }
    if (o.align !== undefined) {
      if (layer.type !== "text" || !allows(layer, "align")) deny("De uitlijning");
      next.align = o.align;
    }
    if (Object.keys(next).length) out[id] = next;
  }
  return out;
}

function clamp(v: number, min: number, max: number) {
  return Math.round(Math.min(max, Math.max(min, v)) * 10) / 10;
}

/**
 * Schema met de aanpassingen uit formData toegepast. Wat de laag niet
 * (meer) toestaat, wordt genegeerd (bv. na een nieuwe templateversie).
 */
export function applyLayerOverrides(schema: TemplateSchemaJson, formData: Record<string, unknown>): TemplateSchemaJson {
  const raw = formData[LAYER_OVERRIDES_KEY];
  if (!raw || typeof raw !== "object") return schema;
  const overrides = raw as LayerOverrides;
  let changed = false;
  const layers = schema.layers.map((layer) => {
    const o = overrides[layer.id];
    if (!o) return layer;
    const next = { ...layer } as Layer & Record<string, unknown>;
    const move = allows(layer, "move") || allows(layer, "resize");
    if (move && typeof o.x === "number") next.x = o.x;
    if (move && typeof o.y === "number") next.y = o.y;
    if (allows(layer, "resize") && typeof o.width === "number") next.width = o.width;
    if (allows(layer, "resize") && typeof o.height === "number") next.height = o.height;
    if (next.type === "text") {
      if (allows(layer, "color") && o.color) next.color = o.color;
      if (allows(layer, "fontSize") && typeof o.fontSize === "number") {
        next.fontSize = o.fontSize;
        next.minFontSize = Math.min(next.minFontSize, o.fontSize);
      }
      if (allows(layer, "align") && o.align) next.align = o.align;
      // Een ander kaderformaat: de tekst volgt weer de uitlijning in het kader.
      if (next.height !== layer.height) delete next.psdBaseline;
    }
    changed = true;
    return next as Layer;
  });
  return changed ? { ...schema, layers } : schema;
}
