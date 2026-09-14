import { z } from "zod";

/**
 * Genormaliseerde template-definitie.
 *
 * Dit is de "target" representatie waar een PSD-import naartoe wordt
 * vertaald (zie src/lib/psd/parse.ts) en die zowel de browser-preview
 * (Konva) als de server-side hoge-resolutie render (src/lib/render)
 * gebruiken om exact hetzelfde ontwerp te tekenen.
 *
 * Alle posities/afmetingen zijn in pixels op de originele PSD-resolutie
 * (`width` x `height`). De preview schaalt dit naar beeldschermgrootte,
 * de export rendert op volledige resolutie.
 */

export const alignSchema = z.enum(["left", "center", "right"]);

export const layerCommonSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number().default(0).optional(),
  opacity: z.number().min(0).max(1).default(1).optional(),
  /**
   * Verwijst naar een TemplateField.key uit VISIBILITY:* dat bepaalt of
   * deze laag zichtbaar is. Meerdere lagen kunnen naar hetzelfde
   * zichtbaarheidsveld verwijzen (bv. alle thuis-specifieke lagen).
   */
  visibilityField: z.string().optional(),
});

export const backgroundLayerSchema = layerCommonSchema.extend({
  type: z.literal("background"),
  src: z.string(),
});

export const staticImageLayerSchema = layerCommonSchema.extend({
  type: z.literal("static_image"),
  src: z.string(),
});

export const textLayerSchema = layerCommonSchema.extend({
  type: z.literal("text"),
  /** TemplateField.key */
  field: z.string(),
  text: z.string().optional(), // fallback/voorbeeldtekst
  fontFamily: z.string().default("Inter"),
  fontWeight: z.number().default(400),
  fontStyle: z.enum(["normal", "italic"]).default("normal"),
  fontSize: z.number(),
  minFontSize: z.number().default(12),
  color: z.string().default("#14120f"),
  align: alignSchema.default("left"),
  uppercase: z.boolean().default(false),
  letterSpacing: z.number().default(0),
  lineHeight: z.number().default(1.15),
  maxLines: z.number().min(1).max(4).default(1),
  allowTruncate: z.boolean().default(false),
});

export const imageLayerSchema = layerCommonSchema.extend({
  type: z.literal("image"),
  /** TemplateField.key */
  field: z.string(),
  fit: z.enum(["contain", "cover"]).default("cover"),
  shape: z.enum(["rect", "circle"]).default("rect"),
  cornerRadius: z.number().default(0),
  placeholderSrc: z.string().optional(),
});

export const colorLayerSchema = layerCommonSchema.extend({
  type: z.literal("color"),
  /** TemplateField.key naar een BRAND_COLOR veld */
  field: z.string(),
  shape: z.enum(["rect", "circle"]).default("rect"),
  cornerRadius: z.number().default(0),
  defaultColor: z.string().default("#ea6a12"),
});

export const layerSchema = z.discriminatedUnion("type", [
  backgroundLayerSchema,
  staticImageLayerSchema,
  textLayerSchema,
  imageLayerSchema,
  colorLayerSchema,
]);

export const templateSchemaJson = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  backgroundColor: z.string().default("#ffffff"),
  layers: z.array(layerSchema),
});

export type Align = z.infer<typeof alignSchema>;
export type BackgroundLayer = z.infer<typeof backgroundLayerSchema>;
export type StaticImageLayer = z.infer<typeof staticImageLayerSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type ImageLayer = z.infer<typeof imageLayerSchema>;
export type ColorLayer = z.infer<typeof colorLayerSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type TemplateSchemaJson = z.infer<typeof templateSchemaJson>;

// ---------------------------------------------------------------------------
// Velden (formulier dat de gebruiker te zien krijgt)
// ---------------------------------------------------------------------------

export const fieldTypeSchema = z.enum([
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMBER",
  "SCORE",
  "DATE",
  "TIME",
  "DROPDOWN",
  "CHECKBOX",
  "IMAGE",
  "LOGO",
  "BRAND_COLOR",
]);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export const textTransformSchema = z.enum([
  "NONE",
  "UPPERCASE",
  "LOWERCASE",
  "CAPITALIZE",
]);
export type TextTransform = z.infer<typeof textTransformSchema>;

export const dropdownOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const templateFieldInputSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, "Gebruik kleine letters, cijfers en underscores"),
  label: z.string().min(1),
  type: fieldTypeSchema,
  required: z.boolean().default(false),
  defaultValue: z.string().optional().nullable(),
  placeholder: z.string().optional().nullable(),
  maxLength: z.number().int().positive().optional().nullable(),
  textTransform: textTransformSchema.default("NONE"),
  options: z.array(dropdownOptionSchema).optional().nullable(),
  imageFit: z.enum(["contain", "cover"]).optional().nullable(),
  imageAspectRatio: z.string().optional().nullable(),
  allowTransparency: z.boolean().default(false),
  sortOrder: z.number().default(0),
});
export type TemplateFieldInput = z.infer<typeof templateFieldInputSchema>;

// ---------------------------------------------------------------------------
// PSD-naamgevingsconventie (zie /docs/psd-conventions)
// ---------------------------------------------------------------------------

export const PSD_PREFIXES = {
  TEXT: "TEXT:",
  IMAGE: "IMAGE:",
  COLOR: "COLOR:",
  VISIBILITY: "VISIBILITY:",
  STATIC: "STATIC:",
} as const;

/** Bepaalt het meest waarschijnlijke veldtype op basis van de technische naam. */
export function guessFieldTypeFromKey(key: string): FieldType {
  const k = key.toLowerCase();
  if (k.includes("logo")) return "LOGO";
  if (k.includes("photo") || k.includes("image") || k.includes("foto")) return "IMAGE";
  if (k.includes("score")) return "SCORE";
  if (k.includes("date") || k.includes("datum")) return "DATE";
  if (k.includes("time") || k.includes("tijd")) return "TIME";
  if (k.includes("color") || k.includes("kleur")) return "BRAND_COLOR";
  return "SHORT_TEXT";
}
