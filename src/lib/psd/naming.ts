import { PSD_PREFIXES } from "@/lib/validations/template";

export type DynamicKind = "TEXT" | "IMAGE" | "COLOR" | "VISIBILITY" | "STATIC" | null;

export interface ParsedLayerName {
  kind: DynamicKind;
  /** Technische veldnaam (slug), bv. "opponent_logo" */
  key: string;
  /** De naam zoals de designer die in Photoshop typte, zonder prefix. */
  label: string;
}

/**
 * Herkent de PSD-laagnaamgevingsconventie, zie /docs/psd-conventions.
 *   TEXT:PLAYER_NAME, IMAGE:PLAYER, COLOR:ACCENT, VISIBILITY:HOME, STATIC:*
 */
export function parseLayerName(rawName: string | undefined): ParsedLayerName {
  const name = (rawName ?? "").trim();

  for (const [kind, prefix] of Object.entries(PSD_PREFIXES) as [
    keyof typeof PSD_PREFIXES,
    string
  ][]) {
    if (name.toUpperCase().startsWith(prefix)) {
      const rest = name.slice(prefix.length).trim();
      return { kind, key: slugify(rest || name), label: humanize(rest || name) };
    }
  }

  return { kind: null, key: slugify(name || "laag"), label: humanize(name || "Laag") };
}

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(slug) ? slug : `v_${slug || "veld"}`;
}

export function humanize(input: string): string {
  return input
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
