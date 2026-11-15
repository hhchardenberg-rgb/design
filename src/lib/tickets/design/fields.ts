// Ticketontwerp: de vaste lijst met instelbare velden. Pure TypeScript zonder imports van
// server- of browsercode, zodat de editor, de mobiele pagina, de pdf en de tests precies
// dezelfde definitie gebruiken.
//
// Drie soorten gegevens blijven gescheiden:
// 1. vormgeving (dit bestand: kleuren, teksten, blokken, logo's),
// 2. feitelijke ticket- en wedstrijdgegevens (uit het ticketsysteem, zie dynamic.ts),
// 3. toegangsrechten (uit het ticketsysteem en de scanner; hier niet instelbaar).

export type Format = "mobile" | "a4";
export type Layer = "shared" | Format;
export const FORMATS: Format[] = ["mobile", "a4"];
export const FORMAT_LABEL: Record<Layer, string> = { shared: "Beide formaten", mobile: "Mobiel", a4: "A4" };

/** Soort ticket; bepaalt welke ontwerpset standaard wordt gebruikt. */
export type TicketKind = "match" | "hospitality" | "season";
export const KIND_LABEL: Record<TicketKind, string> = { match: "Wedstrijdticket", hospitality: "Hospitality- en sponsorticket", season: "Seizoenskaart" };

export type BlockId = "header" | "hero" | "match" | "type" | "qr" | "holder" | "access" | "message" | "info" | "sponsors" | "extra" | "footer";
export interface BlockInfo {
  label: string;
  /** Essentieel voor herkenning en scannen: altijd zichtbaar. */
  protected?: boolean;
}
export const BLOCKS: Record<BlockId, BlockInfo> = {
  header: { label: "Kop met clublogo" },
  hero: { label: "Sfeerbeeld" },
  match: { label: "Wedstrijd of seizoen", protected: true },
  type: { label: "Tickettype", protected: true },
  qr: { label: "QR-code", protected: true },
  holder: { label: "Tickethouder", protected: true },
  access: { label: "Toegang (ingang en vak)" },
  message: { label: "Actieboodschap" },
  info: { label: "Praktische informatie" },
  sponsors: { label: "Sponsoren" },
  extra: { label: "Vrij tekstblok" },
  footer: { label: "Voettekst", protected: true },
};
export const BLOCK_IDS = Object.keys(BLOCKS) as BlockId[];
export interface BlockEntry {
  id: BlockId;
  visible: boolean;
}

export type GroupKey =
  | "ontwerpset"
  | "huisstijl"
  | "typografie"
  | "logos"
  | "sfeerbeeld"
  | "layout"
  | "wedstrijdkop"
  | "houder"
  | "tickettype"
  | "toegang"
  | "scan"
  | "praktisch"
  | "boodschap"
  | "sponsoren"
  | "voettekst"
  | "extra"
  | "ontbrekend";

export const GROUPS: { key: GroupKey; label: string; help: string; block?: BlockId }[] = [
  { key: "ontwerpset", label: "Ontwerpset", help: "Welke gepubliceerde ontwerpset de basis is, per soort ticket." },
  { key: "huisstijl", label: "Huisstijl", help: "Hoofd-, accent-, achtergrond- en tekstkleuren." },
  { key: "typografie", label: "Typografie", help: "Lettertypen, grootte, gewicht en regelafstand." },
  { key: "logos", label: "Logo's", help: "Clublogo en logo van de tegenstander.", block: "header" },
  { key: "sfeerbeeld", label: "Sfeerbeeld", help: "Achtergrondfoto, uitsnede, positie en transparantie.", block: "hero" },
  { key: "layout", label: "Layout", help: "Blokken, volgorde, uitlijning, witruimte, randen en hoeken." },
  { key: "wedstrijdkop", label: "Wedstrijd- en seizoenskop", help: "Presentatie van teams, competitie, datum en tijden.", block: "match" },
  { key: "houder", label: "Tickethouder", help: "Presentatie van de naam en toegestane aanvullende velden.", block: "holder" },
  { key: "tickettype", label: "Tickettype", help: "Label, accentkleur en uitleg. Verandert nooit de rechten.", block: "type" },
  { key: "toegang", label: "Toegang", help: "Ingang en vak, zoals ze in het ticketsysteem staan.", block: "access" },
  { key: "scan", label: "QR-code", help: "Positie, veilige afmetingen en begeleidende tekst.", block: "qr" },
  { key: "praktisch", label: "Praktische informatie", help: "Entree, route, bereikbaarheid en contact.", block: "info" },
  { key: "boodschap", label: "Actieboodschap", help: "Een korte, opvallende boodschap, bijvoorbeeld bij een actie.", block: "message" },
  { key: "sponsoren", label: "Sponsoren", help: "Selectie, volgorde, grootte en begeleidende tekst.", block: "sponsors" },
  { key: "voettekst", label: "Voettekst", help: "Voorwaarden, contactgegevens en versie van de teksten.", block: "footer" },
  { key: "extra", label: "Vrij tekstblok", help: "Een beheerd tekstblok met eigen titel.", block: "extra" },
  { key: "ontbrekend", label: "Ontbrekende gegevens", help: "Wat er verschijnt als een gegeven ontbreekt. Leeg = de regel vervalt netjes." },
];

export type FieldType = "color" | "font" | "weight" | "number" | "text" | "longtext" | "bool" | "select" | "asset" | "assets" | "blocks" | "designSet";

export interface FieldDef {
  key: string;
  group: GroupKey;
  label: string;
  help?: string;
  type: FieldType;
  /** Waar het veld iets doet. "both" = mobiel en A4 (dan ook per formaat aan te passen). */
  formats: "both" | Format;
  /** "Niet tonen" toegestaan (het element verdwijnt, en bij een hoofdveld ook het blok). */
  allowHidden?: boolean;
  /** "Bewust leeg" toegestaan (het element blijft weg, zonder vervangende tekst; het blok blijft staan). */
  allowEmpty?: boolean;
  /** Alleen in de uitgebreide weergave. */
  advanced?: boolean;
  /** Tekst met dynamische velden ({{naam}}). */
  dynamic?: boolean;
  /** Tekst die bij een ontbrekend gegeven deze vervangende tekst krijgt (ook met dynamische velden). */
  fallback?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  maxLength?: number;
  options?: { value: string; label: string }[];
  assetKind?: "LOGO" | "SPONSOR" | "PHOTO";
  /** Standaardwaarde, eventueel per formaat. */
  default: unknown;
  defaultMobile?: unknown;
  defaultA4?: unknown;
  /** Alleen relevant voor deze soorten tickets. */
  kinds?: TicketKind[];
  /** Hoofdveld van een blok: "Niet tonen" laat het hele blok weg. */
  hidesBlock?: boolean;
}

export const FONT_OPTIONS = [
  { value: "din", label: "FF DIN (huisstijl)" },
  { value: "inter", label: "Inter" },
];
export const WEIGHT_OPTIONS = [
  { value: "medium", label: "Medium (normaal)" },
  { value: "bold", label: "Bold (vet)" },
  { value: "black", label: "Black (extra vet)" },
];
const SPACING = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normaal" },
  { value: "ruim", label: "Ruim" },
];

const MOBILE_BLOCKS: BlockEntry[] = (["header", "hero", "match", "type", "qr", "holder", "access", "message", "info", "sponsors", "extra", "footer"] as BlockId[]).map((id) => ({ id, visible: true }));
const A4_BLOCKS: BlockEntry[] = (["header", "hero", "match", "qr", "holder", "type", "access", "message", "info", "extra", "sponsors", "footer"] as BlockId[]).map((id) => ({ id, visible: true }));

export const DEFAULT_TERMS =
  "Dit ticket is persoonsgebonden en niet overdraagbaar. Toegang alleen na een geldige scan bij de ingang; de scanner bepaalt de actuele geldigheid. Deel de QR-code niet met anderen.";

export const FIELDS: FieldDef[] = [
  // Ontwerpset (alleen op club-, seizoens- en duelniveau)
  { key: "design.match", group: "ontwerpset", label: "Ontwerpset voor wedstrijdtickets", type: "designSet", formats: "both", default: null, kinds: ["match"] },
  { key: "design.hospitality", group: "ontwerpset", label: "Ontwerpset voor hospitality- en sponsortickets", type: "designSet", formats: "both", default: null, kinds: ["hospitality"] },
  { key: "design.season", group: "ontwerpset", label: "Ontwerpset voor seizoenskaarten", type: "designSet", formats: "both", default: null, kinds: ["season"] },

  // Huisstijl (officieel: PMS Orange 021 = #FF6F00 en zwart)
  { key: "color.primary", group: "huisstijl", label: "Hoofdkleur", help: "Kopbalk en sterke vlakken.", type: "color", formats: "both", default: "#000000" },
  { key: "color.onPrimary", group: "huisstijl", label: "Tekst op hoofdkleur", type: "color", formats: "both", default: "#FFFFFF", advanced: true },
  { key: "color.accent", group: "huisstijl", label: "Accentkleur", help: "Lijnen, labels en accenten. HHC-oranje is #FF6F00.", type: "color", formats: "both", default: "#FF6F00" },
  { key: "color.onAccent", group: "huisstijl", label: "Tekst op accentkleur", type: "color", formats: "both", default: "#000000", advanced: true },
  { key: "color.background", group: "huisstijl", label: "Achtergrond", type: "color", formats: "both", default: "#FFFFFF" },
  { key: "color.page", group: "huisstijl", label: "Achtergrond rond het ticket (mobiel)", type: "color", formats: "mobile", default: "#F2F0ED", advanced: true },
  { key: "color.text", group: "huisstijl", label: "Tekstkleur", type: "color", formats: "both", default: "#111111" },
  { key: "color.muted", group: "huisstijl", label: "Tekstkleur toelichting", type: "color", formats: "both", default: "#57534E" },

  // Typografie
  { key: "font.heading", group: "typografie", label: "Lettertype koppen", type: "font", formats: "both", default: "din", options: FONT_OPTIONS },
  { key: "font.headingWeight", group: "typografie", label: "Gewicht koppen", type: "weight", formats: "both", default: "black", options: WEIGHT_OPTIONS },
  { key: "font.body", group: "typografie", label: "Lettertype tekst", type: "font", formats: "both", default: "inter", options: FONT_OPTIONS },
  { key: "font.scale", group: "typografie", label: "Tekstgrootte", type: "number", formats: "both", default: 100, min: 90, max: 120, step: 5, unit: "%" },
  { key: "font.lineHeight", group: "typografie", label: "Regelafstand", type: "number", formats: "both", default: 1.35, min: 1.15, max: 1.6, step: 0.05, advanced: true },

  // Logo's
  { key: "logo.club", group: "logos", label: "Clublogo", help: "Standaard het officiële HHC-logo uit de Hub.", type: "asset", assetKind: "LOGO", formats: "both", default: "builtin:hhc", allowHidden: true },
  { key: "logo.clubName", group: "logos", label: "Clubnaam naast het logo", type: "text", formats: "both", default: "HHC Hardenberg", allowEmpty: true, maxLength: 60 },
  { key: "logo.showOpponent", group: "logos", label: "Logo's van beide teams tonen", help: "Gebruikt het logo uit de tegenstandersbibliotheek als de wedstrijd daaraan gekoppeld is.", type: "bool", formats: "both", default: true, kinds: ["match", "hospitality"] },
  { key: "logo.opponent", group: "logos", label: "Vervangend logo tegenstander", help: "Alleen nodig als de wedstrijd niet aan de tegenstandersbibliotheek gekoppeld is.", type: "asset", assetKind: "LOGO", formats: "both", default: null, allowEmpty: true, advanced: true, kinds: ["match", "hospitality"] },

  // Sfeerbeeld
  { key: "hero.image", group: "sfeerbeeld", label: "Sfeerbeeld", help: "'Bewust leeg' toont een vlak in de hoofdkleur zonder foto; 'Niet tonen' laat het hele vlak weg.", type: "asset", assetKind: "PHOTO", formats: "both", default: null, allowHidden: true, allowEmpty: true, hidesBlock: true },
  { key: "hero.focusX", group: "sfeerbeeld", label: "Uitsnede horizontaal", type: "number", formats: "both", default: 50, min: 0, max: 100, step: 5, unit: "%" },
  { key: "hero.focusY", group: "sfeerbeeld", label: "Uitsnede verticaal", type: "number", formats: "both", default: 50, min: 0, max: 100, step: 5, unit: "%" },
  { key: "hero.opacity", group: "sfeerbeeld", label: "Zichtbaarheid foto", type: "number", formats: "both", default: 85, min: 15, max: 100, step: 5, unit: "%" },
  { key: "hero.height", group: "sfeerbeeld", label: "Hoogte", type: "select", formats: "both", default: "normal", options: [{ value: "laag", label: "Laag" }, { value: "normal", label: "Normaal" }, { value: "hoog", label: "Hoog" }], advanced: true },

  // Layout
  { key: "layout.blocks", group: "layout", label: "Blokken en volgorde", help: "Wedstrijd, tickettype, QR-code, houder en voettekst zijn altijd zichtbaar.", type: "blocks", formats: "both", default: MOBILE_BLOCKS, defaultMobile: MOBILE_BLOCKS, defaultA4: A4_BLOCKS },
  { key: "layout.align", group: "layout", label: "Uitlijning", type: "select", formats: "both", default: "left", options: [{ value: "left", label: "Links" }, { value: "center", label: "Midden" }] },
  { key: "layout.spacing", group: "layout", label: "Witruimte", type: "select", formats: "both", default: "normal", options: SPACING },
  { key: "layout.radius", group: "layout", label: "Afgeronde hoeken", type: "number", formats: "both", default: 16, defaultA4: 6, min: 0, max: 28, step: 2, unit: "px" },
  { key: "layout.border", group: "layout", label: "Rand om blokken", type: "bool", formats: "both", default: false, defaultA4: true },
  { key: "a4.margin", group: "layout", label: "Paginamarge", help: "Minimaal 10 mm, zodat niets buiten het afdrukbare gebied valt.", type: "number", formats: "a4", default: 14, min: 10, max: 25, step: 1, unit: "mm" },
  { key: "a4.columns", group: "layout", label: "Kolommen", type: "select", formats: "a4", default: "2", options: [{ value: "2", label: "Twee kolommen (gegevens en QR naast elkaar)" }, { value: "1", label: "Eén kolom (QR onder de gegevens)" }] },
  { key: "a4.background", group: "layout", label: "Achtergrond pagina", type: "select", formats: "a4", default: "white", options: [{ value: "white", label: "Wit" }, { value: "tint", label: "Lichte tint van de accentkleur" }] },
  { key: "a4.inkSaver", group: "layout", label: "Inktzuinig afdrukken", help: "Geen gekleurde vlakken en geen foto; alles blijft leesbaar in zwart-wit.", type: "bool", formats: "a4", default: false },

  // Wedstrijd- en seizoenskop
  { key: "match.style", group: "wedstrijdkop", label: "Weergave", type: "select", formats: "both", default: "teams", options: [{ value: "teams", label: "Thuisclub – uitclub" }, { value: "title", label: "Titel van de wedstrijd" }], kinds: ["match", "hospitality"] },
  { key: "match.title", group: "wedstrijdkop", label: "Kop", type: "text", dynamic: true, formats: "both", default: "{{thuisclub}} – {{uitclub}}", fallback: "{{wedstrijd}}", maxLength: 120, kinds: ["match", "hospitality"] },
  { key: "match.subtitle", group: "wedstrijdkop", label: "Regel boven de kop", type: "text", dynamic: true, formats: "both", default: "{{competitie}}", allowEmpty: true, maxLength: 120, kinds: ["match", "hospitality"] },
  { key: "match.dateLine", group: "wedstrijdkop", label: "Datumregel", type: "text", dynamic: true, formats: "both", default: "{{wedstrijddag}} {{wedstrijddatum}}", maxLength: 120, kinds: ["match", "hospitality"] },
  { key: "match.timeLine", group: "wedstrijdkop", label: "Tijdregel", type: "text", dynamic: true, formats: "both", default: "Aanvang {{aanvangstijd}}", maxLength: 120, kinds: ["match", "hospitality"] },
  { key: "match.gatesLine", group: "wedstrijdkop", label: "Poorten open", type: "text", dynamic: true, formats: "both", default: "Poorten open {{poorten_open}}", allowEmpty: true, maxLength: 120, kinds: ["match", "hospitality"] },
  { key: "match.gatesMinutes", group: "wedstrijdkop", label: "Poorten open (minuten voor aanvang)", help: "Standaardwaarde; controleer en pas per duel aan.", type: "number", formats: "both", default: 60, min: 15, max: 180, step: 15, unit: "min", kinds: ["match", "hospitality"] },
  { key: "match.locationLine", group: "wedstrijdkop", label: "Locatieregel", type: "text", dynamic: true, formats: "both", default: "{{locatie}}", allowEmpty: true, maxLength: 120, advanced: true, kinds: ["match", "hospitality"] },
  { key: "season.title", group: "wedstrijdkop", label: "Kop seizoenskaart", type: "text", dynamic: true, formats: "both", default: "Seizoenskaart {{seizoen}}", fallback: "Seizoenskaart", maxLength: 120, kinds: ["season"] },
  { key: "season.validityLine", group: "wedstrijdkop", label: "Geldigheid", help: "Komt uit de bestaande toegangsregels van het ticket; de editor breidt die niet uit.", type: "text", dynamic: true, formats: "both", default: "{{geldigheid}}", maxLength: 200, kinds: ["season"] },

  // Tickethouder
  { key: "holder.label", group: "houder", label: "Label boven de naam", type: "text", formats: "both", default: "Naam", allowEmpty: true, maxLength: 40 },
  { key: "holder.showCompany", group: "houder", label: "Bedrijfsnaam tonen (als die bekend is)", help: "Alleen tonen als dat voor dit ticket nodig is.", type: "bool", formats: "both", default: false },

  // Tickettype
  { key: "type.label", group: "tickettype", label: "Label", help: "Alleen de weergave; de rechten blijven die van het tickettype.", type: "text", dynamic: true, formats: "both", default: "{{tickettype}}", maxLength: 60 },
  { key: "type.accent", group: "tickettype", label: "Accentkleur van het type", help: "'Bewust leeg' gebruikt de algemene accentkleur.", type: "color", formats: "both", default: null, allowEmpty: true },
  { key: "type.explanation", group: "tickettype", label: "Uitleg bij het type", type: "longtext", dynamic: true, formats: "both", default: "", allowEmpty: true, maxLength: 300 },

  // Toegang
  { key: "access.showEntrance", group: "toegang", label: "Ingang tonen", help: "Alleen als het vak van het ticket aan een ingang gekoppeld is.", type: "bool", formats: "both", default: true },
  { key: "access.entranceLabel", group: "toegang", label: "Label ingang", type: "text", formats: "both", default: "Ingang", maxLength: 30 },
  { key: "access.showZone", group: "toegang", label: "Vak tonen", type: "bool", formats: "both", default: true },
  { key: "access.zoneLabel", group: "toegang", label: "Label vak", type: "text", formats: "both", default: "Vak", maxLength: 30 },

  // QR-code
  { key: "qr.caption", group: "scan", label: "Tekst bij de QR-code", type: "text", formats: "both", default: "Toon deze code bij de ingang", allowEmpty: true, maxLength: 80 },
  { key: "qr.mobileSize", group: "scan", label: "Grootte op mobiel", help: "Begrensd zodat de code altijd scanbaar blijft.", type: "number", formats: "mobile", default: 78, min: 62, max: 92, step: 2, unit: "% van de breedte" },
  { key: "qr.a4Size", group: "scan", label: "Grootte op A4", help: "Minimaal 40 mm voor een betrouwbare scan van papier.", type: "number", formats: "a4", default: 60, min: 40, max: 80, step: 2, unit: "mm" },
  { key: "qr.a4Position", group: "scan", label: "Positie op A4", type: "select", formats: "a4", default: "right", options: [{ value: "right", label: "Rechts" }, { value: "left", label: "Links" }] },

  // Praktische informatie
  { key: "info.title", group: "praktisch", label: "Titel", type: "text", formats: "both", default: "Praktische informatie", allowEmpty: true, maxLength: 60 },
  { key: "info.entry", group: "praktisch", label: "Entree", type: "longtext", dynamic: true, formats: "both", default: "Kom op tijd: de poorten openen om {{poorten_open}}. Houd je ticket klaar bij de ingang.", allowEmpty: true, maxLength: 400 },
  { key: "info.route", group: "praktisch", label: "Route en parkeren", type: "longtext", dynamic: true, formats: "both", default: "", allowEmpty: true, maxLength: 400 },
  { key: "info.contact", group: "praktisch", label: "Contact", type: "longtext", formats: "both", default: "", allowEmpty: true, maxLength: 300 },
  { key: "info.collapsed", group: "praktisch", label: "Op mobiel inklappen", type: "bool", formats: "mobile", default: true, advanced: true },

  // Actieboodschap
  { key: "message.text", group: "boodschap", label: "Boodschap", type: "longtext", dynamic: true, formats: "both", default: "", allowEmpty: true, maxLength: 200, hidesBlock: true },
  { key: "message.tone", group: "boodschap", label: "Stijl", type: "select", formats: "both", default: "accent", options: [{ value: "accent", label: "Accentkleur" }, { value: "neutral", label: "Rustig" }] },

  // Sponsoren
  { key: "sponsors.items", group: "sponsoren", label: "Sponsorlogo's (in volgorde)", type: "assets", assetKind: "SPONSOR", formats: "both", default: [], allowHidden: true, allowEmpty: true, hidesBlock: true, max: 8 },
  { key: "sponsors.title", group: "sponsoren", label: "Begeleidende tekst", type: "text", formats: "both", default: "Met dank aan onze partners", allowEmpty: true, maxLength: 80 },
  { key: "sponsors.size", group: "sponsoren", label: "Grootte logo's", type: "select", formats: "both", default: "m", options: [{ value: "s", label: "Klein" }, { value: "m", label: "Middel" }, { value: "l", label: "Groot" }] },
  { key: "sponsors.align", group: "sponsoren", label: "Uitlijning logo's", type: "select", formats: "both", default: "center", options: [{ value: "center", label: "Gecentreerd" }, { value: "left", label: "Links" }], advanced: true },

  // Voettekst
  { key: "footer.terms", group: "voettekst", label: "Voorwaarden", type: "longtext", formats: "both", default: DEFAULT_TERMS, allowEmpty: true, maxLength: 600 },
  { key: "footer.contact", group: "voettekst", label: "Contactgegevens", type: "text", formats: "both", default: "", allowEmpty: true, maxLength: 160 },
  { key: "footer.termsVersion", group: "voettekst", label: "Versie van de teksten", help: "Bijvoorbeeld 'Huisregels 2026'. Wordt klein in de voettekst getoond.", type: "text", formats: "both", default: "", allowEmpty: true, maxLength: 60 },

  // Vrij tekstblok
  { key: "extra.title", group: "extra", label: "Titel", type: "text", dynamic: true, formats: "both", default: "", allowEmpty: true, maxLength: 60 },
  { key: "extra.text", group: "extra", label: "Tekst", type: "longtext", dynamic: true, formats: "both", default: "", allowEmpty: true, maxLength: 500, hidesBlock: true },

  // Ontbrekende gegevens
  { key: "missing.uitclub", group: "ontbrekend", label: "Als de tegenstander ontbreekt", type: "text", formats: "both", default: "", allowEmpty: true, maxLength: 60, advanced: true },
  { key: "missing.ingang", group: "ontbrekend", label: "Als de ingang ontbreekt", type: "text", formats: "both", default: "", allowEmpty: true, maxLength: 60 },
  { key: "missing.vak", group: "ontbrekend", label: "Als het vak ontbreekt", type: "text", formats: "both", default: "", allowEmpty: true, maxLength: 60, advanced: true },
  { key: "missing.competitie", group: "ontbrekend", label: "Als de competitie ontbreekt", type: "text", formats: "both", default: "", allowEmpty: true, maxLength: 60, advanced: true },
];

export const FIELD_MAP: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
export const isFieldKey = (k: string) => k in FIELD_MAP;

/** Het veld werkt in dit formaat. */
export const fieldInFormat = (f: FieldDef, format: Format) => f.formats === "both" || f.formats === format;

/** Kan het veld op deze laag worden ingesteld? (formaatgebonden velden alleen op hun eigen formaat of gedeeld). */
export function fieldAllowsLayer(f: FieldDef, layer: Layer): boolean {
  if (f.type === "designSet") return layer === "shared";
  if (f.formats === "both") return true;
  return layer === "shared" || layer === f.formats;
}

export function defaultFor(f: FieldDef, format: Format): unknown {
  if (format === "mobile" && f.defaultMobile !== undefined) return f.defaultMobile;
  if (format === "a4" && f.defaultA4 !== undefined) return f.defaultA4;
  return f.default;
}

/** Soort ticket uit de bestaande tickettype-gegevens. */
export function kindOf(t: { isSeasonCard?: boolean | null; validityMode?: string | null; category?: string | null }): TicketKind {
  if (t.isSeasonCard || t.validityMode === "SEASON" || t.category === "SEASON") return "season";
  if (t.category === "VIP" || t.category === "SPONSOR") return "hospitality";
  return "match";
}

export const designFieldFor = (kind: TicketKind) => `design.${kind}`;
