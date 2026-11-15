// Ticketontwerp: van feitelijke ticketgegevens + effectieve instellingen naar één weergavemodel
// per formaat. De mobiele pagina en de A4-indeling tekenen alleen dit model, zodat beide formaten
// gegarandeerd dezelfde inhoud tonen. Puur, zonder server- of browsercode.

import { formatDay } from "@/lib/date-format";
import { BLOCKS, FIELD_MAP, type BlockEntry, type BlockId, type Format, type TicketKind } from "./fields";
import { renderWithFallback, type DynamicValues } from "./dynamic";
import type { Resolved } from "./resolve";

export const SAMPLE_CODE = "HHC-VOORBEELD-GEEN-TOEGANG";
export const CLUB_NAME = "HHC Hardenberg";

/** Feitelijke gegevens van één ticket, uit het ticketsysteem. Nooit uit de editor. */
export interface TicketFacts {
  /** Voorbeeldticket in de editor: duidelijk gemarkeerd, met een testcode die geen toegang geeft. */
  sample: boolean;
  kind: TicketKind;
  firstName: string;
  lastName: string;
  company: string | null;
  typeName: string;
  typeColor: string | null;
  ticketNumber: string;
  /** De ondertekende scancode van het ticketsysteem (of de testcode bij een voorbeeld). */
  qrCode: string;
  seasonName: string | null;
  validityText: string;
  event: {
    title: string;
    opponent: string | null;
    isHome: boolean;
    competition: string | null;
    startsAt: string | Date;
    location: string | null;
    status: string;
    opponentLogoUrl: string | null;
  } | null;
  /** Meerdere gekoppelde wedstrijden (MULTI): lijst ter info. */
  events: { title: string; startsAt: string | Date }[];
  zoneName: string | null;
  entranceName: string | null;
  /** Actuele wijzigingen sinds uitgifte (uit het ticketsysteem). */
  notices: string[];
  /** Status zoals het ticketsysteem die nu ziet (tekst), alleen ter info: de scanner beslist. */
  statusLabel: string;
  usable: boolean;
}

export interface AssetRef {
  assetId: string;
  versionId: string | null;
  url: string;
  width: number;
  height: number;
  name: string;
}
export type AssetMap = Record<string, AssetRef>;
export const BUILTIN_HHC_LOGO: AssetRef = { assetId: "builtin:hhc", versionId: null, url: "/branding/hhc-logo.png", width: 706, height: 900, name: "HHC-logo (officieel)" };

export interface ViewStyle {
  primary: string;
  onPrimary: string;
  accent: string;
  onAccent: string;
  background: string;
  page: string;
  text: string;
  muted: string;
  typeAccent: string;
  headingFont: "din" | "inter";
  headingWeight: "medium" | "bold" | "black";
  bodyFont: "din" | "inter";
  scale: number;
  lineHeight: number;
  align: "left" | "center";
  spacing: "compact" | "normal" | "ruim";
  radius: number;
  border: boolean;
}

export type ViewBlock =
  | { id: "header"; logo: AssetRef | null; clubName: string | null }
  | { id: "hero"; image: AssetRef | null; focusX: number; focusY: number; opacity: number; height: "laag" | "normal" | "hoog" }
  | { id: "match"; mode: "match" | "season" | "multi"; overline: string | null; title: string; lines: string[]; homeLogo: AssetRef | null; awayLogo: AssetRef | null; homeName: string | null; awayName: string | null; cancelled: boolean }
  | { id: "type"; label: string; explanation: string | null }
  | { id: "qr"; code: string; caption: string | null; sample: boolean }
  | { id: "holder"; label: string | null; name: string; company: string | null }
  | { id: "access"; items: { label: string; value: string }[] }
  | { id: "message"; text: string; tone: "accent" | "neutral" }
  | { id: "info"; title: string | null; items: { label: string; text: string }[]; collapsed: boolean }
  | { id: "sponsors"; title: string | null; logos: AssetRef[]; size: "s" | "m" | "l"; align: "center" | "left" }
  | { id: "extra"; title: string | null; text: string }
  | { id: "footer"; terms: string | null; contact: string | null; version: string | null; ticketNumber: string };

export interface TicketView {
  format: Format;
  kind: TicketKind;
  sample: boolean;
  style: ViewStyle;
  blocks: ViewBlock[];
  notices: string[];
  statusLabel: string;
  usable: boolean;
  qrSizeMobile: number;
  a4: { margin: number; columns: 1 | 2; background: "white" | "tint"; inkSaver: boolean; qrSize: number; qrPosition: "left" | "right" };
}

const TZ = "Europe/Amsterdam";
const timeOf = (d: Date) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const weekdayOf = (d: Date) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long" }).format(d);

/** Ticketnummer leesbaar in groepjes van vier. */
export const formatTicketNumber = (publicId: string) => publicId.replace(/(.{4})(?=.)/g, "$1-");

export function dynamicValues(f: TicketFacts, gatesMinutes: number): DynamicValues {
  const e = f.event;
  const start = e ? new Date(e.startsAt) : null;
  const opponent = e?.opponent?.trim() || null;
  return {
    naam: `${f.firstName} ${f.lastName}`.trim(),
    voornaam: f.firstName,
    tickettype: f.typeName,
    ticketnummer: f.ticketNumber,
    seizoen: f.seasonName,
    geldigheid: f.validityText,
    wedstrijd: e?.title ?? null,
    thuisclub: e ? (e.isHome ? CLUB_NAME : opponent) : null,
    uitclub: e ? (e.isHome ? opponent : CLUB_NAME) : null,
    competitie: e?.competition ?? null,
    wedstrijddag: start ? weekdayOf(start) : null,
    wedstrijddatum: start ? formatDay(start) : null,
    aanvangstijd: start ? timeOf(start) : null,
    poorten_open: start ? timeOf(new Date(start.getTime() - gatesMinutes * 60_000)) : null,
    locatie: e?.location ?? null,
    ingang: f.entranceName,
    vak: f.zoneName,
    bedrijf: f.company,
  };
}

const str = (r: Resolved, k: string): string => {
  const v = r[k];
  if (!v || v.state !== "value") return "";
  return typeof v.value === "string" ? v.value : "";
};
const num = (r: Resolved, k: string): number => {
  const v = r[k];
  const d = FIELD_MAP[k];
  const n = v && v.state === "value" && typeof v.value === "number" ? v.value : (d?.default as number);
  // Altijd binnen de veilige grenzen, ook als een oude waarde daarbuiten zou liggen.
  return Math.min(d?.max ?? Infinity, Math.max(d?.min ?? -Infinity, n));
};
const bool = (r: Resolved, k: string): boolean => r[k]?.state === "value" && r[k].value === true;
const state = (r: Resolved, k: string) => r[k]?.state ?? "value";
const color = (r: Resolved, k: string, fb: string): string => {
  const v = str(r, k);
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : fb;
};
const pick = <T extends string>(r: Resolved, k: string, allowed: readonly T[], fb: T): T => {
  const v = str(r, k) as T;
  return allowed.includes(v) ? v : fb;
};

export function blocksOf(r: Resolved): BlockEntry[] {
  const v = r["layout.blocks"]?.value;
  return normalizeBlocks(Array.isArray(v) ? (v as BlockEntry[]) : []);
}

/** Bloklijst altijd volledig en veilig: onbekende blokken weg, ontbrekende achteraan, beschermde blokken zichtbaar. */
export function normalizeBlocks(list: BlockEntry[]): BlockEntry[] {
  const seen = new Set<BlockId>();
  const out: BlockEntry[] = [];
  for (const b of list) {
    if (!b || !(b.id in BLOCKS) || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push({ id: b.id, visible: BLOCKS[b.id].protected ? true : b.visible !== false });
  }
  for (const id of Object.keys(BLOCKS) as BlockId[]) if (!seen.has(id)) out.push({ id, visible: !!BLOCKS[id].protected });
  return out;
}

export function buildView(facts: TicketFacts, r: Resolved, format: Format, assets: AssetMap): TicketView {
  const gates = num(r, "match.gatesMinutes");
  const values = dynamicValues(facts, gates);
  const missing: Record<string, string> = {};
  for (const k of ["uitclub", "ingang", "vak", "competitie"]) {
    const v = str(r, `missing.${k}`);
    if (v.trim()) missing[k] = v;
  }
  // Een uitclub die ontbreekt mag ook de thuisclub (bij een uitwedstrijd) vervangen.
  if (missing.uitclub) missing.thuisclub = missing.uitclub;
  const text = (k: string): string | null => {
    if (state(r, k) !== "value") return null;
    const def = FIELD_MAP[k];
    const raw = str(r, k);
    if (!def?.dynamic) return raw.trim() ? raw.trim() : null;
    return renderWithFallback(raw, values, missing, def.fallback);
  };
  const asset = (k: string): AssetRef | null => {
    const v = r[k];
    if (!v || v.state !== "value" || typeof v.value !== "string") return null;
    if (v.value === "builtin:hhc") return BUILTIN_HHC_LOGO;
    return assets[v.value] ?? null;
  };

  const style: ViewStyle = {
    primary: color(r, "color.primary", "#000000"),
    onPrimary: color(r, "color.onPrimary", "#FFFFFF"),
    accent: color(r, "color.accent", "#FF6F00"),
    onAccent: color(r, "color.onAccent", "#000000"),
    background: color(r, "color.background", "#FFFFFF"),
    page: color(r, "color.page", "#F2F0ED"),
    text: color(r, "color.text", "#111111"),
    muted: color(r, "color.muted", "#57534E"),
    typeAccent: state(r, "type.accent") === "value" && /^#[0-9a-fA-F]{6}$/.test(str(r, "type.accent")) ? str(r, "type.accent").toUpperCase() : facts.typeColor && /^#[0-9a-fA-F]{6}$/.test(facts.typeColor) ? facts.typeColor.toUpperCase() : color(r, "color.accent", "#FF6F00"),
    headingFont: pick(r, "font.heading", ["din", "inter"] as const, "din"),
    headingWeight: pick(r, "font.headingWeight", ["medium", "bold", "black"] as const, "black"),
    bodyFont: pick(r, "font.body", ["din", "inter"] as const, "inter"),
    scale: num(r, "font.scale") / 100,
    lineHeight: num(r, "font.lineHeight"),
    align: pick(r, "layout.align", ["left", "center"] as const, "left"),
    spacing: pick(r, "layout.spacing", ["compact", "normal", "ruim"] as const, "normal"),
    radius: num(r, "layout.radius"),
    border: bool(r, "layout.border"),
  };

  const blocks: ViewBlock[] = [];
  for (const entry of blocksOf(r)) {
    if (!entry.visible) continue;
    const b = buildBlock(entry.id);
    if (b) blocks.push(b);
  }

  function buildBlock(id: BlockId): ViewBlock | null {
    switch (id) {
      case "header": {
        const logo = asset("logo.club");
        const clubName = text("logo.clubName");
        if (!logo && !clubName) return null;
        return { id, logo: state(r, "logo.club") === "hidden" ? null : logo, clubName };
      }
      case "hero": {
        const st = state(r, "hero.image");
        if (st === "hidden") return null;
        const image = asset("hero.image");
        // Geen foto en niet bewust leeg: dan geen vlak (er is niets in te stellen).
        if (!image && st !== "empty") return null;
        return { id, image: st === "empty" ? null : image, focusX: num(r, "hero.focusX"), focusY: num(r, "hero.focusY"), opacity: num(r, "hero.opacity") / 100, height: pick(r, "hero.height", ["laag", "normal", "hoog"] as const, "normal") };
      }
      case "match": {
        const e = facts.event;
        if (facts.kind === "season" || !e) {
          if (facts.kind !== "season" && facts.events.length > 1) {
            return { id, mode: "multi", overline: facts.seasonName, title: `${facts.events.length} wedstrijden`, lines: facts.events.map((x) => `${x.title} · ${formatDay(x.startsAt)}`), homeLogo: null, awayLogo: null, homeName: null, awayName: null, cancelled: false };
          }
          const title = facts.kind === "season" ? text("season.title") ?? "Seizoenskaart" : facts.validityText || facts.typeName;
          const lines = facts.kind === "season" ? [text("season.validityLine")].filter((x): x is string => !!x) : [];
          return { id, mode: "season", overline: null, title, lines, homeLogo: null, awayLogo: null, homeName: null, awayName: null, cancelled: false };
        }
        const style = pick(r, "match.style", ["teams", "title"] as const, "teams");
        const title = style === "title" ? e.title : text("match.title") ?? e.title;
        const lines = ["match.dateLine", "match.timeLine", "match.gatesLine", "match.locationLine"].map((k) => text(k)).filter((x): x is string => !!x);
        // Alleen beide logo's samen, anders oogt de kop scheef.
        const showLogos = bool(r, "logo.showOpponent") && style === "teams";
        const club = asset("logo.club") ?? BUILTIN_HHC_LOGO;
        const oppLogo: AssetRef | null = e.opponentLogoUrl ? { assetId: "opponent", versionId: null, url: e.opponentLogoUrl, width: 400, height: 400, name: e.opponent ?? "Tegenstander" } : asset("logo.opponent");
        const home = e.isHome ? club : oppLogo;
        const away = e.isHome ? oppLogo : club;
        return {
          id,
          mode: "match",
          overline: text("match.subtitle"),
          title,
          lines,
          homeLogo: showLogos && home && away ? home : null,
          awayLogo: showLogos && home && away ? away : null,
          homeName: (values.thuisclub as string) ?? null,
          awayName: (values.uitclub as string) ?? null,
          cancelled: e.status === "CANCELLED",
        };
      }
      case "type":
        return { id, label: text("type.label") ?? facts.typeName, explanation: text("type.explanation") };
      case "qr":
        return { id, code: facts.qrCode, caption: text("qr.caption"), sample: facts.sample };
      case "holder":
        return { id, label: text("holder.label"), name: `${facts.firstName} ${facts.lastName}`.trim(), company: bool(r, "holder.showCompany") && facts.company ? facts.company : null };
      case "access": {
        const items: { label: string; value: string }[] = [];
        const entrance = facts.entranceName ?? missing.ingang ?? null;
        const zone = facts.zoneName ?? missing.vak ?? null;
        if (bool(r, "access.showEntrance") && entrance) items.push({ label: str(r, "access.entranceLabel") || "Ingang", value: entrance });
        if (bool(r, "access.showZone") && zone) items.push({ label: str(r, "access.zoneLabel") || "Vak", value: zone });
        // Ongebruikte velden (tribune, rij, stoel bestaan niet in het ticketsysteem) laten geen lege labels achter.
        return items.length ? { id, items } : null;
      }
      case "message": {
        const t = text("message.text");
        return t ? { id, text: t, tone: pick(r, "message.tone", ["accent", "neutral"] as const, "accent") } : null;
      }
      case "info": {
        const items = (
          [
            ["Entree", "info.entry"],
            ["Route en parkeren", "info.route"],
            ["Contact", "info.contact"],
          ] as const
        )
          .map(([label, k]) => ({ label, text: text(k) }))
          .filter((x): x is { label: "Entree" | "Route en parkeren" | "Contact"; text: string } => !!x.text);
        if (!items.length) return null;
        return { id, title: text("info.title"), items, collapsed: format === "mobile" && bool(r, "info.collapsed") };
      }
      case "sponsors": {
        if (state(r, "sponsors.items") === "hidden") return null;
        const ids = Array.isArray(r["sponsors.items"]?.value) ? (r["sponsors.items"].value as string[]) : [];
        const logos = ids.map((x) => assets[x]).filter((x): x is AssetRef => !!x);
        if (!logos.length) return null;
        return { id, title: text("sponsors.title"), logos, size: pick(r, "sponsors.size", ["s", "m", "l"] as const, "m"), align: pick(r, "sponsors.align", ["center", "left"] as const, "center") };
      }
      case "extra": {
        const t = text("extra.text");
        return t ? { id, title: text("extra.title"), text: t } : null;
      }
      case "footer":
        return { id, terms: text("footer.terms"), contact: text("footer.contact"), version: text("footer.termsVersion"), ticketNumber: facts.ticketNumber };
    }
  }

  return {
    format,
    kind: facts.kind,
    sample: facts.sample,
    style,
    blocks,
    notices: facts.notices,
    statusLabel: facts.statusLabel,
    usable: facts.usable,
    qrSizeMobile: num(r, "qr.mobileSize"),
    a4: {
      margin: num(r, "a4.margin"),
      columns: str(r, "a4.columns") === "1" ? 1 : 2,
      background: pick(r, "a4.background", ["white", "tint"] as const, "white"),
      inkSaver: bool(r, "a4.inkSaver"),
      qrSize: num(r, "qr.a4Size"),
      qrPosition: pick(r, "qr.a4Position", ["left", "right"] as const, "right"),
    },
  };
}

/** Asset-id's die in de effectieve instellingen gebruikt worden (voor het vastleggen van versies). */
export function usedAssetIds(r: Resolved): string[] {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(r)) {
    const def = FIELD_MAP[k];
    if (!def || v.state !== "value") continue;
    if (def.type === "asset" && typeof v.value === "string" && !v.value.startsWith("builtin:")) out.add(v.value);
    if (def.type === "assets" && Array.isArray(v.value)) for (const x of v.value) if (typeof x === "string") out.add(x);
  }
  return [...out];
}

/** Voorbeeldgegevens voor de editor: duidelijk gemarkeerd en met een testcode zonder toegang. */
export const SAMPLE_PRESETS = {
  kort: { label: "Korte namen", firstName: "Jan", lastName: "de Vries", company: "Voorbeeld BV", opponent: "Voorbeeldclub", entrance: "Ingang Noord", zone: "Hoofdtribune", competition: "Competitie" },
  lang: { label: "Lange namen", firstName: "Maximiliaan Alexander", lastName: "van den Hoogenband-Vermeulen", company: "Voorbeeldbedrijf Installatietechniek en Onderhoud Oost-Nederland BV", opponent: "Sportvereniging Koninklijke Voorbeeldclub Combinatie '09", entrance: "Ingang Hoofdtribune West", zone: "Business Seats Hoofdtribune", competition: "Voorbeeldcompetitie" },
  ontbrekend: { label: "Ontbrekende optionele gegevens", firstName: "Sam", lastName: "Jansen", company: null, opponent: null, entrance: null, zone: null, competition: null },
} as const;
export type SamplePreset = keyof typeof SAMPLE_PRESETS;
