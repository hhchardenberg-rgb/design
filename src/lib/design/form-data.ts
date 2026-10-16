import { z } from "zod";
import type { FieldType } from "@/lib/validations/template";

/**
 * Server-side validatie van ontwerpinvoer (formData) tegen de velden van de
 * vastgepinde templateversie. Puur (geen database), zodat het zowel in de
 * API als in tests gebruikt kan worden; het autoriseren van afbeeldingen
 * gebeurt apart in assets.server.ts.
 *
 * Regels:
 *  - alleen sleutels van velden van déze versie;
 *  - per veldtype het juiste type, eindige getallen, lengtegrenzen en
 *    toegestane keuzes;
 *  - verplichte velden worden pas bij exporteren afgedwongen (een concept
 *    mag onvolledig zijn).
 */

export interface ValidationField {
  key: string;
  label: string;
  type: FieldType | string;
  required: boolean;
  maxLength: number | null;
  defaultValue: string | null;
  options: unknown;
}

export const MAX_FORM_DATA_BYTES = 64 * 1024;
const DEFAULT_SHORT_TEXT_MAX = 300;
const DEFAULT_LONG_TEXT_MAX = 2000;
const MAX_PAN = 100_000;

export const IMAGE_ASSET_KINDS = ["upload", "opponent", "team", "club", "player", "stock"] as const;
export type ImageAssetKind = (typeof IMAGE_ASSET_KINDS)[number];

export const imageAssetRefSchema = z.object({
  kind: z.enum(IMAGE_ASSET_KINDS),
  id: z.string().min(1).max(64),
});
export type ImageAssetRef = z.infer<typeof imageAssetRefSchema>;

const finite = z.number().finite();

export const imageValueSchema = z
  .object({
    asset: imageAssetRefSchema.optional(),
    assetUrl: z.string().max(2048).optional(),
    panX: finite.min(-MAX_PAN).max(MAX_PAN).optional(),
    panY: finite.min(-MAX_PAN).max(MAX_PAN).optional(),
    scale: finite.min(0.2).max(10).optional(),
  })
  .strict();
export type ImageValue = z.infer<typeof imageValueSchema>;

export class FormDataError extends Error {
  constructor(message: string, public fieldKey?: string) {
    super(message);
  }
}

export interface NormalizeOptions {
  /** Hex-kleuren die een BRAND_COLOR-veld mag aannemen (huisstijl + standaardwaarden). */
  allowedColors: Set<string>;
}

/**
 * Valideert en normaliseert formData. Gooit FormDataError bij de eerste
 * fout, met een melding die de gebruiker kan begrijpen.
 */
export function normalizeFormData(
  fields: ValidationField[],
  input: unknown,
  options: NormalizeOptions
): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new FormDataError("Ongeldige invoer.");
  }
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_FORM_DATA_BYTES) {
    throw new FormDataError("De invoer is te groot.");
  }

  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const field = byKey.get(key);
    if (!field) throw new FormDataError(`Onbekend veld "${key}" voor deze templateversie.`, key);
    if (raw === undefined || raw === null) continue;
    out[key] = normalizeValue(field, raw, options);
  }
  return out;
}

function normalizeValue(field: ValidationField, raw: unknown, options: NormalizeOptions): unknown {
  const fail = (msg: string): never => {
    throw new FormDataError(`${field.label}: ${msg}`, field.key);
  };

  switch (field.type) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
    case "DATE":
    case "TIME": {
      if (typeof raw !== "string") fail("verwacht tekst.");
      const text = raw as string;
      const multiline = field.type === "LONG_TEXT";
      // Handmatige regeleinden zijn alleen in lange tekst toegestaan; andere
      // stuurtekens nooit (die tekenen in geen enkele renderer iets zinnigs).
      const forbidden = multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/;
      if (forbidden.test(text)) fail(multiline ? "bevat ongeldige tekens." : "regeleinden zijn hier niet toegestaan.");
      const max = field.maxLength ?? (multiline ? DEFAULT_LONG_TEXT_MAX : DEFAULT_SHORT_TEXT_MAX);
      if ([...text].length > max) fail(`maximaal ${max} tekens.`);
      return text;
    }
    case "NUMBER":
    case "SCORE": {
      // Bewust als tekst bewaard: "" (niet ingevuld) is iets anders dan "0".
      const text = typeof raw === "number" ? String(raw) : raw;
      if (typeof text !== "string") fail("verwacht een getal.");
      const trimmed = (text as string).trim();
      if (trimmed === "") return "";
      const value = Number(trimmed);
      if (!Number.isFinite(value) || !/^-?\d+([.,]\d+)?$/.test(trimmed)) fail("geen geldig getal.");
      if (field.type === "SCORE" && (!Number.isInteger(value) || value < 0 || value > 999)) {
        fail("een score is een heel getal van 0 tot en met 999.");
      }
      if (Math.abs(value) > 1e9) fail("getal is te groot.");
      return trimmed;
    }
    case "DROPDOWN": {
      if (typeof raw !== "string") fail("verwacht een keuze.");
      if (raw === "") return "";
      const values = dropdownValues(field.options);
      if (!values.includes(raw as string)) fail("deze keuze bestaat niet.");
      return raw;
    }
    case "CHECKBOX": {
      if (raw === true || raw === "true") return true;
      if (raw === false || raw === "false") return false;
      return fail("verwacht aan of uit.");
    }
    case "BRAND_COLOR": {
      if (typeof raw !== "string" || !/^#[0-9a-fA-F]{6}$/.test(raw)) fail("ongeldige kleur.");
      const hex = (raw as string).toUpperCase();
      if (!options.allowedColors.has(hex)) fail("deze kleur hoort niet bij de huisstijl.");
      return hex;
    }
    case "IMAGE":
    case "LOGO": {
      const parsed = imageValueSchema.safeParse(raw);
      if (!parsed.success) fail("ongeldige afbeeldingsgegevens.");
      return parsed.data;
    }
    default:
      return fail("dit veldtype wordt niet ondersteund.");
  }
}

export function dropdownValues(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) => (typeof o === "string" ? o : o && typeof o === "object" ? (o as { value?: unknown }).value : undefined))
    .filter((v): v is string => typeof v === "string");
}

/** Velden die verplicht zijn en (nog) geen waarde hebben. */
export function missingRequiredFields(fields: ValidationField[], formData: Record<string, unknown>): ValidationField[] {
  return fields.filter((f) => {
    if (!f.required) return false;
    const v = formData[f.key];
    if (f.type === "IMAGE" || f.type === "LOGO") {
      const img = v as ImageValue | undefined;
      return !img?.asset && !img?.assetUrl;
    }
    if (f.type === "CHECKBOX") return false;
    return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
  });
}

/** Stabiele JSON-weergave (gesorteerde sleutels) voor hashes en vergelijkingen. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
