// Ticketontwerp: één gedeelde logica die de effectieve instellingen bepaalt. De editor, de
// mobiele ticketpagina en de pdf gebruiken allemaal deze functie, zodat ze voor hetzelfde ticket
// dezelfde waarden en dezelfde herkomst tonen. Puur en zonder imports van server- of browsercode.
//
// Voorrang (van algemeen naar specifiek), per veld:
//   standaard → ontwerpset → club → club per tickettype → seizoen → seizoen per tickettype → duel → duel per tickettype
// Binnen ieder niveau eerst de gedeelde instelling (beide formaten), daarna de formaatafwijking van
// datzelfde niveau. Een expliciete waarde op een later niveau wint; "Overerven" (geen regel) laat de
// eerder gevonden waarde staan. Leeg, uit of 0 is een gewone eigen waarde en nooit "overerven".

import { FIELDS, FIELD_MAP, defaultFor, designFieldFor, fieldAllowsLayer, fieldInFormat, type FieldDef, type Format, type Layer, type TicketKind } from "./fields";

/** Een bewuste afwijking op een niveau. Ontbreekt de regel, dan erft het veld. */
export type Override = { m: "value"; v: unknown } | { m: "hidden" } | { m: "empty" };
export type OverrideMap = Partial<Record<Layer, Record<string, Override>>>;

export type Level = "default" | "set" | "club" | "clubType" | "season" | "seasonType" | "event" | "eventType";
export const LEVEL_ORDER: Level[] = ["default", "set", "club", "clubType", "season", "seasonType", "event", "eventType"];
export const LEVEL_LABEL: Record<Level, string> = {
  default: "Standaard",
  set: "Ontwerpset",
  club: "Club algemeen",
  clubType: "Club per tickettype",
  season: "Seizoen algemeen",
  seasonType: "Seizoen per tickettype",
  event: "Duel algemeen",
  eventType: "Duel per tickettype",
};

export interface LayerInput {
  level: Level;
  scopeKey: string;
  /** Leesbare herkomst, bijvoorbeeld "seizoen 2026/2027" of "HHC – AFC (tickettype VIP)". */
  label: string;
  overrides: OverrideMap;
}

export interface Origin {
  level: Level;
  layer: Layer;
  scopeKey: string | null;
  label: string;
}

export type ResolvedState = "value" | "hidden" | "empty";
export interface ResolvedField {
  state: ResolvedState;
  value: unknown;
  origin: Origin;
  /** Eerdere waarden die door deze zijn vervangen (voor uitleg in de editor). */
  overridden: Origin[];
}
export type Resolved = Record<string, ResolvedField>;

// ── Scopesleutels ─────────────────────────────────────────────────────────────

export interface ScopeRef {
  level: Exclude<Level, "default">;
  setId?: string;
  seasonId?: string;
  eventId?: string;
  typeId?: string;
}

export function scopeKeyOf(r: ScopeRef): string {
  switch (r.level) {
    case "set":
      return `set:${r.setId}`;
    case "club":
      return "club";
    case "clubType":
      return `club:type:${r.typeId}`;
    case "season":
      return `season:${r.seasonId}`;
    case "seasonType":
      return `season:${r.seasonId}:type:${r.typeId}`;
    case "event":
      return `event:${r.eventId}`;
    case "eventType":
      return `event:${r.eventId}:type:${r.typeId}`;
  }
}

const ID = "[A-Za-z0-9_-]{1,64}";
const PATTERNS: [RegExp, (m: RegExpMatchArray) => ScopeRef][] = [
  [new RegExp(`^set:(${ID})$`), (m) => ({ level: "set", setId: m[1] })],
  [/^club$/, () => ({ level: "club" })],
  [new RegExp(`^club:type:(${ID})$`), (m) => ({ level: "clubType", typeId: m[1] })],
  [new RegExp(`^season:(${ID})$`), (m) => ({ level: "season", seasonId: m[1] })],
  [new RegExp(`^season:(${ID}):type:(${ID})$`), (m) => ({ level: "seasonType", seasonId: m[1], typeId: m[2] })],
  [new RegExp(`^event:(${ID})$`), (m) => ({ level: "event", eventId: m[1] })],
  [new RegExp(`^event:(${ID}):type:(${ID})$`), (m) => ({ level: "eventType", eventId: m[1], typeId: m[2] })],
];

export function parseScopeKey(key: string): ScopeRef | null {
  for (const [re, fn] of PATTERNS) {
    const m = key.match(re);
    if (m) return fn(m);
  }
  return null;
}

/** De keten van niveaus voor een ticketcontext (zonder standaard en ontwerpset). */
export function chainFor(ctx: { typeId?: string | null; seasonId?: string | null; eventId?: string | null }): ScopeRef[] {
  const out: ScopeRef[] = [{ level: "club" }];
  if (ctx.typeId) out.push({ level: "clubType", typeId: ctx.typeId });
  if (ctx.seasonId) {
    out.push({ level: "season", seasonId: ctx.seasonId });
    if (ctx.typeId) out.push({ level: "seasonType", seasonId: ctx.seasonId, typeId: ctx.typeId });
  }
  if (ctx.eventId) {
    out.push({ level: "event", eventId: ctx.eventId });
    if (ctx.typeId) out.push({ level: "eventType", eventId: ctx.eventId, typeId: ctx.typeId });
  }
  return out;
}

// ── Resolutie ────────────────────────────────────────────────────────────────

const DEFAULT_ORIGIN = (layer: Layer): Origin => ({ level: "default", layer, scopeKey: null, label: "Standaard" });

function apply(field: FieldDef, cur: ResolvedField, o: Override | undefined, origin: Origin): ResolvedField {
  if (!o) return cur;
  const overridden = [...cur.overridden, cur.origin];
  if (o.m === "hidden") return field.allowHidden ? { state: "hidden", value: null, origin, overridden } : cur;
  if (o.m === "empty") return field.allowEmpty ? { state: "empty", value: emptyValueOf(field), origin, overridden } : cur;
  return { state: "value", value: o.v, origin, overridden };
}

export function emptyValueOf(f: FieldDef): unknown {
  if (f.type === "assets") return [];
  if (f.type === "text" || f.type === "longtext") return "";
  return null;
}

/** Effectieve instellingen voor één formaat. `layers` in volgorde van algemeen naar specifiek (zonder standaard). */
export function resolveFormat(layers: LayerInput[], format: Format): Resolved {
  const out: Resolved = {};
  for (const f of FIELDS) {
    if (!fieldInFormat(f, format)) continue;
    let cur: ResolvedField = { state: "value", value: defaultFor(f, format), origin: DEFAULT_ORIGIN(f.formats === "both" ? "shared" : format), overridden: [] };
    for (const l of layers) {
      const base = { level: l.level, scopeKey: l.scopeKey, label: l.label };
      if (fieldAllowsLayer(f, "shared")) cur = apply(f, cur, l.overrides.shared?.[f.key], { ...base, layer: "shared" });
      if (fieldAllowsLayer(f, format)) cur = apply(f, cur, l.overrides[format]?.[f.key], { ...base, layer: format });
    }
    out[f.key] = cur;
  }
  return out;
}

export interface SetLayer {
  id: string;
  name: string;
  overrides: OverrideMap;
}

export interface FullResolution {
  kind: TicketKind;
  setId: string | null;
  setOrigin: Origin | null;
  mobile: Resolved;
  a4: Resolved;
  /** De gebruikte lagen (handig voor uitleg en snapshots). */
  layers: { level: Level; scopeKey: string; label: string }[];
}

/**
 * Volledige resolutie voor een ticketcontext: kies eerst de ontwerpset (veld design.<soort>, alleen
 * gedeeld, over club → duel per tickettype), en los daarna alle velden op met de set als basislaag.
 * `fallbackSetId` is de ingebouwde basisset voor deze soort als niemand bewust een set koos.
 */
export function resolveAll(input: { kind: TicketKind; chain: LayerInput[]; sets: Record<string, SetLayer>; fallbackSetId: string | null }): FullResolution {
  const designKey = designFieldFor(input.kind);
  let setId = input.fallbackSetId;
  let setOrigin: Origin | null = null;
  for (const l of input.chain) {
    const o = l.overrides.shared?.[designKey];
    if (o && o.m === "value" && typeof o.v === "string" && input.sets[o.v]) {
      setId = o.v;
      setOrigin = { level: l.level, layer: "shared", scopeKey: l.scopeKey, label: l.label };
    }
  }
  const set = setId ? input.sets[setId] : undefined;
  const layers: LayerInput[] = [];
  if (set) layers.push({ level: "set", scopeKey: `set:${set.id}`, label: `ontwerpset ${set.name}`, overrides: set.overrides });
  layers.push(...input.chain);
  return {
    kind: input.kind,
    setId: set?.id ?? null,
    setOrigin,
    mobile: resolveFormat(layers, "mobile"),
    a4: resolveFormat(layers, "a4"),
    layers: layers.map((l) => ({ level: l.level, scopeKey: l.scopeKey, label: l.label })),
  };
}

/** Herkomst in gewone taal, voor naast een instelling in de editor. */
export function originText(o: Origin, currentScopeKey?: string | null): string {
  const fmt = o.layer === "shared" ? "" : ` (alleen ${o.layer === "mobile" ? "mobiel" : "A4"})`;
  if (o.level === "default") return `Standaardwaarde${fmt}`;
  if (currentScopeKey && o.scopeKey === currentScopeKey) return `Aangepast op dit niveau${fmt}`;
  return `Van ${o.label}${fmt}`;
}

// ── Bewerken van een afwijkingenlijst ─────────────────────────────────────────

export function getOverride(map: OverrideMap, layer: Layer, key: string): Override | undefined {
  return map[layer]?.[key];
}

/** Zet of verwijdert (undefined = overerven) één afwijking; geeft een nieuwe lijst terug. */
export function setOverride(map: OverrideMap, layer: Layer, key: string, o: Override | undefined): OverrideMap {
  const next: OverrideMap = { ...map, [layer]: { ...(map[layer] ?? {}) } };
  if (o === undefined) delete next[layer]![key];
  else next[layer]![key] = o;
  if (Object.keys(next[layer]!).length === 0) delete next[layer];
  return next;
}

/** Alle afwijkingen van een onderdeel (groep) verwijderen; geeft ook terug welke verdwijnen. */
export function resetGroup(map: OverrideMap, group: string): { map: OverrideMap; removed: { layer: Layer; key: string }[] } {
  const removed: { layer: Layer; key: string }[] = [];
  let next = map;
  for (const layer of ["shared", "mobile", "a4"] as Layer[]) {
    for (const key of Object.keys(map[layer] ?? {})) {
      if (FIELD_MAP[key]?.group === group) {
        removed.push({ layer, key });
        next = setOverride(next, layer, key, undefined);
      }
    }
  }
  return { map: next, removed };
}

export function overrideCount(map: OverrideMap | null | undefined): number {
  if (!map) return 0;
  return (["shared", "mobile", "a4"] as Layer[]).reduce((n, l) => n + Object.keys(map[l] ?? {}).length, 0);
}

export function listOverrides(map: OverrideMap | null | undefined): { layer: Layer; key: string; o: Override }[] {
  if (!map) return [];
  return (["shared", "mobile", "a4"] as Layer[]).flatMap((layer) => Object.entries(map[layer] ?? {}).map(([key, o]) => ({ layer, key, o })));
}

/** Stabiele JSON (gesorteerde sleutels): voor vergelijken en hashes. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v instanceof Date ? v.toISOString() : v);
}

/** Verschillen tussen twee afwijkingenlijsten (bijvoorbeeld concept tegenover gepubliceerd). */
export function diffOverrides(a: OverrideMap | null | undefined, b: OverrideMap | null | undefined): { layer: Layer; key: string; before?: Override; after?: Override }[] {
  const out: { layer: Layer; key: string; before?: Override; after?: Override }[] = [];
  for (const layer of ["shared", "mobile", "a4"] as Layer[]) {
    const keys = new Set([...Object.keys(a?.[layer] ?? {}), ...Object.keys(b?.[layer] ?? {})]);
    for (const key of keys) {
      const before = a?.[layer]?.[key];
      const after = b?.[layer]?.[key];
      if (stableStringify(before) !== stableStringify(after)) out.push({ layer, key, before, after });
    }
  }
  return out;
}
