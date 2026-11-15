// Dynamische velden in ontwerpteksten, zoals {{naam}} en {{wedstrijddatum}}. Ze zijn gekoppeld aan
// het echte gegevensmodel (tickets_tickets, tickets_events, tickets_types, tickets_seasons,
// tickets_zones, tickets_entrances). Een ontwerper kan de waarden zelf nooit aanpassen.
// Een onverwerkte variabele verschijnt nooit op een uitgegeven ticket.

export interface DynamicFieldInfo {
  key: string;
  label: string;
  help: string;
  sample: string;
  /** Altijd aanwezig op een echt ticket (naam, type, nummer). */
  always?: boolean;
  /** Alleen bij een ticket met één concrete wedstrijd. */
  matchOnly?: boolean;
}

export const DYNAMIC_FIELDS: DynamicFieldInfo[] = [
  { key: "naam", label: "Naam tickethouder", help: "Voor- en achternaam zoals op het ticket.", sample: "Jan de Vries", always: true },
  { key: "voornaam", label: "Voornaam", help: "Voornaam van de tickethouder.", sample: "Jan", always: true },
  { key: "tickettype", label: "Tickettype", help: "Naam van het tickettype uit Tickettypes.", sample: "Vrijkaart", always: true },
  { key: "ticketnummer", label: "Ticketnummer", help: "Leesbaar kenmerk voor hulp bij problemen (geen toegangscode).", sample: "ABCD-EFGH-JKLM-NPQR", always: true },
  { key: "seizoen", label: "Seizoen", help: "Naam van het seizoen van het ticket of de wedstrijd.", sample: "2026/2027" },
  { key: "geldigheid", label: "Geldigheid", help: "Omschrijving uit de bestaande toegangsregels (bijvoorbeeld bij een seizoenskaart).", sample: "Geldig voor alle thuiswedstrijden in seizoen 2026/2027" },
  { key: "wedstrijd", label: "Wedstrijdtitel", help: "De titel van de wedstrijd zoals in Wedstrijden.", sample: "HHC Hardenberg – Voorbeeldclub", matchOnly: true },
  { key: "thuisclub", label: "Thuisclub", help: "HHC Hardenberg bij een thuiswedstrijd, anders de tegenstander.", sample: "HHC Hardenberg", matchOnly: true },
  { key: "uitclub", label: "Uitclub", help: "De tegenstander bij een thuiswedstrijd, anders HHC Hardenberg.", sample: "Voorbeeldclub", matchOnly: true },
  { key: "competitie", label: "Competitie", help: "Competitie van de wedstrijd, als die is ingevuld.", sample: "Competitie", matchOnly: true },
  { key: "wedstrijddag", label: "Dag van de week", help: "Bijvoorbeeld 'zaterdag'.", sample: "zaterdag", matchOnly: true },
  { key: "wedstrijddatum", label: "Wedstrijddatum", help: "Datum als dd/mm/yyyy.", sample: "01/01/2000", matchOnly: true },
  { key: "aanvangstijd", label: "Aanvangstijd", help: "Tijd van de aftrap (Nederlandse tijd).", sample: "14:30", matchOnly: true },
  { key: "poorten_open", label: "Poorten open", help: "Aanvang min het ingestelde aantal minuten.", sample: "13:30", matchOnly: true },
  { key: "locatie", label: "Locatie", help: "Locatie van de wedstrijd, als die is ingevuld.", sample: "Voorbeeldlocatie", matchOnly: true },
  { key: "ingang", label: "Ingang", help: "De ingang die bij het vak van het ticket hoort.", sample: "Ingang Noord" },
  { key: "vak", label: "Vak", help: "Het vak (toegangstype) van het ticket.", sample: "Hoofdtribune" },
  { key: "bedrijf", label: "Bedrijf", help: "Alleen als het ticket een bedrijfsnaam heeft en die getoond mag worden.", sample: "Voorbeeld BV" },
];
export const DYNAMIC_KEYS = new Set(DYNAMIC_FIELDS.map((d) => d.key));

/** Waarden voor één ticket; ontbrekend = undefined of lege tekst. */
export type DynamicValues = Partial<Record<string, string | null | undefined>>;

const TOKEN = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function tokensIn(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((m) => m[1]);
}

/** Fouten in een tekst: onbekende velden of losse accolades. */
export function textIssues(text: string): string[] {
  const out: string[] = [];
  for (const t of tokensIn(text)) if (!DYNAMIC_KEYS.has(t)) out.push(`Onbekend gegeven {{${t}}}.`);
  const stripped = text.replace(TOKEN, "");
  if (/\{\{|\}\}/.test(stripped)) out.push("Er staat een onvolledig gegeven (accolades) in de tekst.");
  return out;
}

const present = (v: string | null | undefined): v is string => typeof v === "string" && v.trim() !== "";

/**
 * Vult een tekst in. Per regel: ontbreekt een gegeven, dan eerst de ingestelde vervangende tekst
 * voor dat gegeven (missing.<veld>), anders vervalt de hele regel netjes. Geeft null als er niets
 * overblijft. Onbekende of kapotte variabelen worden altijd verwijderd, nooit getoond.
 */
export function renderText(text: string, values: DynamicValues, missing: Record<string, string> = {}): string | null {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    let dropped = false;
    const filled = line.replace(TOKEN, (_m, key: string) => {
      if (!DYNAMIC_KEYS.has(key)) {
        dropped = true;
        return "";
      }
      const v = values[key];
      if (present(v)) return v;
      const alt = missing[key];
      if (present(alt)) return alt;
      dropped = true;
      return "";
    });
    if (dropped) continue;
    // Restanten van kapotte variabelen nooit tonen.
    out.push(filled.replace(/\{\{|\}\}/g, "").replace(/[ \t]+/g, " ").trim());
  }
  const result = out.join("\n").trim();
  return result === "" ? null : result;
}

/** Een tekst met eventueel een vervangende tekst (bijvoorbeeld de wedstrijdtitel als de clubs ontbreken). */
export function renderWithFallback(text: string, values: DynamicValues, missing: Record<string, string>, fallback?: string): string | null {
  const r = renderText(text, values, missing);
  if (r !== null || !fallback) return r;
  return renderText(fallback, values, missing);
}
