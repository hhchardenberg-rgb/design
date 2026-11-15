// Ticketontwerp: controles op invoer (server) en op het ontwerp (editor en publiceren).
// Puur, zonder server- of browsercode.

import { BLOCKS, FIELD_MAP, GROUPS, fieldAllowsLayer, type FieldDef, type Format, type Layer } from "./fields";
import { textIssues } from "./dynamic";
import { normalizeBlocks, type TicketView } from "./view";
import { listOverrides, type Override, type OverrideMap, type Resolved } from "./resolve";

export interface DesignIssue {
  /** error = publiceren niet mogelijk; warning = advies. */
  level: "error" | "warning";
  message: string;
  field?: string;
  format?: Format;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const LAYERS: Layer[] = ["shared", "mobile", "a4"];

function valueIssue(f: FieldDef, v: unknown): string | null {
  switch (f.type) {
    case "color":
      return typeof v === "string" && HEX.test(v) ? null : "Kies een geldige kleur (#RRGGBB).";
    case "number":
      if (typeof v !== "number" || !Number.isFinite(v)) return "Vul een getal in.";
      if (f.min !== undefined && v < f.min) return `Minimaal ${f.min}${f.unit ? ` ${f.unit}` : ""}.`;
      if (f.max !== undefined && v > f.max) return `Maximaal ${f.max}${f.unit ? ` ${f.unit}` : ""}.`;
      return null;
    case "text":
    case "longtext": {
      if (typeof v !== "string") return "Vul een tekst in.";
      if (f.maxLength && v.length > f.maxLength) return `Maximaal ${f.maxLength} tekens.`;
      if (f.type === "text" && /[\r\n]/.test(v)) return "Eén regel tekst.";
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) return "De tekst bevat ongeldige tekens.";
      if (f.dynamic) return textIssues(v)[0] ?? null;
      if (/\{\{|\}\}/.test(v)) return "In dit veld kunnen geen gegevens worden ingevoegd.";
      return null;
    }
    case "bool":
      return typeof v === "boolean" ? null : "Kies aan of uit.";
    case "select":
    case "font":
    case "weight":
      return typeof v === "string" && (f.options ?? []).some((o) => o.value === v) ? null : "Kies een van de mogelijkheden.";
    case "asset":
      if (typeof v !== "string" || !v) return "Kies een afbeelding.";
      if (v.startsWith("builtin:")) return f.key === "logo.club" && v === "builtin:hhc" ? null : "Onbekende afbeelding.";
      return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? null : "Onbekende afbeelding.";
    case "assets":
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(x))) return "Kies afbeeldingen uit de bibliotheek.";
      if (new Set(v).size !== v.length) return "Elk logo maar één keer.";
      if (f.max !== undefined && v.length > f.max) return `Maximaal ${f.max} logo's.`;
      return null;
    case "blocks": {
      if (!Array.isArray(v)) return "Ongeldige bloklijst.";
      for (const b of v as { id?: string; visible?: boolean }[]) {
        if (!b || typeof b.id !== "string" || !(b.id in BLOCKS)) return "Onbekend blok in de lijst.";
        if (BLOCKS[b.id as keyof typeof BLOCKS].protected && b.visible === false) return `'${BLOCKS[b.id as keyof typeof BLOCKS].label}' moet zichtbaar blijven.`;
      }
      return null;
    }
    case "designSet":
      return typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? null : "Kies een ontwerpset.";
  }
}

/**
 * Controleert en normaliseert een afwijkingenlijst van één niveau. Gooit niets: geeft de schone lijst
 * plus fouten terug. `isSet` = de basis van een ontwerpset (daar kan geen ontwerpset gekozen worden).
 */
export function sanitizeOverrides(raw: unknown, opts: { isSet: boolean }): { map: OverrideMap; errors: DesignIssue[] } {
  const errors: DesignIssue[] = [];
  const map: OverrideMap = {};
  if (!raw || typeof raw !== "object") return { map, errors };
  for (const layer of LAYERS) {
    const entries = (raw as Record<string, unknown>)[layer];
    if (!entries || typeof entries !== "object") continue;
    for (const [key, o] of Object.entries(entries as Record<string, unknown>)) {
      const f = FIELD_MAP[key];
      if (!f) {
        errors.push({ level: "error", message: `Onbekende instelling '${key}'.` });
        continue;
      }
      if (!fieldAllowsLayer(f, layer)) {
        errors.push({ level: "error", message: `'${f.label}' kan niet apart voor ${layer === "mobile" ? "mobiel" : layer === "a4" ? "A4" : "beide formaten"} worden ingesteld.`, field: key });
        continue;
      }
      if (f.type === "designSet" && opts.isSet) {
        errors.push({ level: "error", message: "In een ontwerpset kies je geen andere ontwerpset.", field: key });
        continue;
      }
      const ov = o as Override;
      if (!ov || typeof ov !== "object" || !("m" in ov)) {
        errors.push({ level: "error", message: `Ongeldige instelling bij '${f.label}'.`, field: key });
        continue;
      }
      if (ov.m === "hidden") {
        if (!f.allowHidden) errors.push({ level: "error", message: `'${f.label}' kan niet worden verborgen.`, field: key });
        else (map[layer] ??= {})[key] = { m: "hidden" };
        continue;
      }
      if (ov.m === "empty") {
        if (!f.allowEmpty) errors.push({ level: "error", message: `'${f.label}' kan niet bewust leeg zijn.`, field: key });
        else (map[layer] ??= {})[key] = { m: "empty" };
        continue;
      }
      if (ov.m !== "value") {
        errors.push({ level: "error", message: `Ongeldige keuze bij '${f.label}'.`, field: key });
        continue;
      }
      const issue = valueIssue(f, ov.v);
      if (issue) {
        errors.push({ level: "error", message: `${f.label}: ${issue}`, field: key });
        continue;
      }
      const v = f.type === "blocks" ? normalizeBlocks(ov.v as never) : f.type === "color" ? String(ov.v).toUpperCase() : ov.v;
      (map[layer] ??= {})[key] = { m: "value", v };
    }
  }
  return { map, errors };
}

// ── Leesbaarheid ─────────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Minimale afmetingen (pixels) voor een scherpe afdruk op A4 (±150 dpi op de gebruikte breedte). */
export const MIN_PIXELS = { heroA4: 1000, heroMobile: 700, sponsorA4: 240, logoA4: 200 };

/** Controles op het uiteindelijke weergavemodel (per formaat). */
export function viewIssues(v: TicketView): DesignIssue[] {
  const out: DesignIssue[] = [];
  const s = v.style;
  const fmt = v.format;
  const name = fmt === "mobile" ? "mobiel" : "A4";
  const pairs: [string, string, string, number][] = [
    [s.text, s.background, "Tekstkleur op de achtergrond", 4.5],
    [s.muted, s.background, "Toelichtingskleur op de achtergrond", 3],
    [s.onPrimary, s.primary, "Tekst op de hoofdkleur", 4.5],
    [s.onAccent, s.accent, "Tekst op de accentkleur", 3],
  ];
  for (const [fg, bg, label, min] of pairs) {
    const c = contrast(fg, bg);
    if (c < min) out.push({ level: c < 2 ? "error" : "warning", message: `${label} is slecht leesbaar (contrast ${c.toFixed(1)}:1, minimaal ${min}:1).`, format: fmt });
  }
  if (fmt === "mobile") {
    const ids = v.blocks.map((b) => b.id);
    const qr = ids.indexOf("qr");
    const late = ["info", "sponsors", "extra", "message"].filter((id) => ids.includes(id as never) && ids.indexOf(id as never) < qr);
    if (late.length) out.push({ level: "error", message: "Zet de QR-code op mobiel boven de actieboodschap, praktische informatie en sponsoren, zodat hij direct in beeld is.", format: fmt });
  }
  for (const b of v.blocks) {
    if (b.id === "hero" && b.image) {
      const min = fmt === "a4" ? MIN_PIXELS.heroA4 : MIN_PIXELS.heroMobile;
      if (b.image.width < min) out.push({ level: "warning", message: `Het sfeerbeeld '${b.image.name}' is te klein voor een scherpe ${name}-weergave (${b.image.width} px breed, minimaal ${min} px).`, format: fmt });
    }
    if (b.id === "sponsors" && fmt === "a4") {
      for (const l of b.logos) if (Math.max(l.width, l.height) < MIN_PIXELS.sponsorA4) out.push({ level: "warning", message: `Sponsorlogo '${l.name}' heeft te weinig pixels voor A4 (${l.width}×${l.height}).`, format: fmt });
    }
    if (b.id === "header" && fmt === "a4" && b.logo && Math.max(b.logo.width, b.logo.height) < MIN_PIXELS.logoA4) out.push({ level: "warning", message: `Het clublogo heeft te weinig pixels voor A4.`, format: fmt });
  }
  return out;
}

/**
 * Afwijkingen op het bewerkte niveau die in de gekozen ontwerpset niet zichtbaar worden
 * (bijvoorbeeld sponsoren terwijl het sponsorblok verborgen is). Die moet de beheerder eerst oplossen.
 */
export function unsupportedOverrides(scopeOverrides: OverrideMap, resolved: Record<Format, Resolved>): DesignIssue[] {
  const out: DesignIssue[] = [];
  for (const { layer, key, o } of listOverrides(scopeOverrides)) {
    if (o.m === "hidden") continue;
    const f = FIELD_MAP[key];
    const block = GROUPS.find((g) => g.key === f?.group)?.block;
    if (!f || !block || BLOCKS[block].protected) continue;
    for (const fmt of (layer === "shared" ? ["mobile", "a4"] : [layer]) as Format[]) {
      const blocks = resolved[fmt]["layout.blocks"]?.value as { id: string; visible: boolean }[] | undefined;
      const entry = blocks?.find((b) => b.id === block);
      if (entry && !entry.visible) {
        out.push({ level: "error", message: `'${f.label}' is aangepast, maar het blok '${BLOCKS[block].label}' staat in deze ontwerpset uit (${fmt === "mobile" ? "mobiel" : "A4"}). Zet het blok aan of herstel de instelling.`, field: key, format: fmt });
      }
    }
  }
  return out;
}
