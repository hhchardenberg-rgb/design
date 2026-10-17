/**
 * Templatefamilies: templates met dezelfde `familyKey` zijn formaatvarianten
 * van één ontwerp (feed, story, vierkant). De invoer van het ene formaat gaat
 * mee naar het andere, voor zover de velden overeenkomen.
 */

const KNOWN_RATIOS: [number, string][] = [
  [1, "Vierkant"],
  [4 / 5, "Portret 4:5"],
  [9 / 16, "Story 9:16"],
  [16 / 9, "Liggend 16:9"],
  [1.91, "Liggend 1,91:1"],
  [3 / 4, "Portret 3:4"],
  [2 / 3, "Portret 2:3"],
  [210 / 297, "A-formaat staand"],
  [297 / 210, "A-formaat liggend"],
];

/** Naam van het formaat: de ingestelde naam, anders afgeleid van de verhouding. */
export function formatName(formatLabel: string | null | undefined, width: number, height: number): string {
  if (formatLabel?.trim()) return formatLabel.trim();
  const ratio = width / height;
  const known = KNOWN_RATIOS.find(([r]) => Math.abs(r - ratio) / r < 0.02);
  return known ? known[1] : `${width}×${height}`;
}

export function normalizeFamilyKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().replace(/\s+/g, " ").slice(0, 80);
  return key || null;
}

const IMAGE_TYPES = new Set(["IMAGE", "LOGO"]);
const TEXT_TYPES = new Set(["SHORT_TEXT", "LONG_TEXT", "NUMBER", "SCORE", "DATE", "TIME", "DROPDOWN"]);

function compatible(a: string, b: string) {
  if (a === b) return true;
  if (IMAGE_TYPES.has(a) && IMAGE_TYPES.has(b)) return true;
  return TEXT_TYPES.has(a) && TEXT_TYPES.has(b) && a !== "DROPDOWN" && b !== "DROPDOWN";
}

/**
 * Invoer van een ontwerp overzetten naar een ander formaat. Alleen velden met
 * dezelfde sleutel en een passend type gaan mee; de uitsnede van een foto
 * begint opnieuw (ander kader) en opmaakaanpassingen per laag blijven achter.
 */
export function carryOverFormData(
  from: Record<string, unknown>,
  fromFields: { key: string; type: string }[],
  toFields: { key: string; type: string }[]
): Record<string, unknown> {
  const fromTypes = new Map(fromFields.map((f) => [f.key, f.type]));
  const out: Record<string, unknown> = {};
  for (const field of toFields) {
    const type = fromTypes.get(field.key);
    const value = from[field.key];
    if (!type || value === undefined || value === null || !compatible(type, field.type)) continue;
    if (IMAGE_TYPES.has(field.type)) {
      const img = value as { asset?: unknown; assetUrl?: unknown };
      if (!img.asset && !img.assetUrl) continue;
      out[field.key] = { ...(img.asset ? { asset: img.asset } : {}), ...(img.assetUrl ? { assetUrl: img.assetUrl } : {}), panX: 0, panY: 0, scale: 1 };
    } else {
      out[field.key] = value;
    }
  }
  return out;
}

/** Standaardwaarden van de velden van een templateversie. */
export function fieldDefaults(fields: { key: string; type: string; defaultValue: string | null }[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === "CHECKBOX") out[f.key] = f.defaultValue !== "false";
    else if (f.defaultValue) out[f.key] = f.defaultValue;
  }
  return out;
}
