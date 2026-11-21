// De standaardrollen van de Hub: per onderdeel een paar niveaus (die elkaar opvolgen:
// elk niveau kan alles van het vorige) en, waar nodig, losse taken die je erbij zet.
//
//   Communicatie       niveaus: medewerker, beheerder
//   Klantenservice     niveaus: basis, medewerker, teamleider, beheerder
//   Commerciële Zaken  niveaus: alleen lezen, medewerker, beheerder; taken: contracten, financiën, mailings
//   HHC Tickets        niveaus: alleen lezen, medewerker, beheerder; taken: scanner, scannercoördinator, ontwerp, financiële rapportages
//
// Plus de vaste rol Hoofdadmin (alles). Standaardrollen staan één keer in de database
// (zie ensureStandardRoles in service.server.ts) en zijn daarna gewone rollen: een
// hoofdadmin mag ze aanpassen of verwijderen; een verwijderde standaardrol komt niet terug.
// Niemand krijgt er automatisch een.

import type { SectionLevel } from "./model";
import { ALL_PERMISSIONS, type Permission } from "@/lib/commercial/permissions";
import { ROLE_TEMPLATES } from "@/lib/commercial/role-templates";
import { TICKET_ROLE_TEMPLATES, withRequired, type TicketPermission } from "@/lib/tickets/permissions";

export type Section = "Communicatie" | "Klantenservice" | "Commerciële Zaken" | "HHC Tickets";
export const SECTIONS: Section[] = ["Communicatie", "Klantenservice", "Commerciële Zaken", "HHC Tickets"];

export interface StandardRole {
  key: string;
  section: Section;
  /** niveau: je kiest er per onderdeel één; taak: los erbij te zetten. */
  kind: "niveau" | "taak";
  /** Volgorde binnen het onderdeel (niveaus van laag naar hoog). */
  rank: number;
  /** Korte naam binnen het onderdeel, bv. "Medewerker". */
  short: string;
  /** Volledige rolnaam, bv. "Communicatie – medewerker". */
  name: string;
  description: string;
  hubLevel: SectionLevel;
  ticketingLevel: SectionLevel;
  /** null = geen toegang tot Commerciële Zaken. */
  commercial: Permission[] | null;
  /** null = geen toegang tot HHC Tickets. */
  tickets: TicketPermission[] | null;
}

const cz = (key: string): Permission[] => {
  const t = ROLE_TEMPLATES.find((x) => x.key === key);
  if (!t) throw new Error(`Onbekend CZ-sjabloon: ${key}`);
  return [...t.permissions].sort();
};
const tk = (key: string): TicketPermission[] => {
  const t = TICKET_ROLE_TEMPLATES.find((x) => x.key === key);
  if (!t) throw new Error(`Onbekend ticketsjabloon: ${key}`);
  return t.permissions;
};

const KS_MEDEWERKER = withRequired(["support:search", "tickets:read", "tickets:personal", "tickets:resend"]);
const KS_TEAMLEIDER = withRequired([...KS_MEDEWERKER, "dashboard:read", "tickets:issue", "tickets:block", "scan:history"]);

type Def = Omit<StandardRole, "name" | "hubLevel" | "ticketingLevel" | "commercial" | "tickets"> &
  Partial<Pick<StandardRole, "hubLevel" | "ticketingLevel" | "commercial" | "tickets">>;

const def = (d: Def): StandardRole => ({
  hubLevel: "NONE",
  ticketingLevel: "NONE",
  commercial: null,
  tickets: null,
  ...d,
  name: `${d.section} – ${d.short.toLowerCase()}`,
});

export const STANDARD_ROLES: StandardRole[] = [
  // --- Communicatie --------------------------------------------------------------
  def({ key: "comm-medewerker", section: "Communicatie", kind: "niveau", rank: 1, short: "Medewerker", hubLevel: "USER", description: "Designtool, agenda, nieuws, kennisbank en de rest van Communicatie gebruiken." }),
  def({ key: "comm-beheerder", section: "Communicatie", kind: "niveau", rank: 2, short: "Beheerder", hubLevel: "ADMIN", description: "Alles van een medewerker, plus de inhoud van Communicatie beheren en anderen toegang geven." }),

  // --- Klantenservice ------------------------------------------------------------
  def({ key: "ks-basis", section: "Klantenservice", kind: "niveau", rank: 1, short: "Basis", ticketingLevel: "USER", description: "Handleidingen, procedures en standaardmails van Klantenservice. Geen klantgegevens." }),
  def({ key: "ks-medewerker", section: "Klantenservice", kind: "niveau", rank: 2, short: "Medewerker", ticketingLevel: "USER", tickets: KS_MEDEWERKER, description: "Basis, plus klanten en tickets zoeken (HHC en Fullhouse) met contactgegevens en tickets opnieuw versturen." }),
  def({ key: "ks-teamleider", section: "Klantenservice", kind: "niveau", rank: 3, short: "Teamleider", ticketingLevel: "USER", tickets: KS_TEAMLEIDER, description: "Medewerker, plus een vervangend ticket uitgeven, tickets blokkeren of heractiveren en de scanhistorie bekijken." }),
  def({ key: "ks-beheerder", section: "Klantenservice", kind: "niveau", rank: 4, short: "Beheerder", ticketingLevel: "ADMIN", tickets: KS_TEAMLEIDER, description: "Teamleider, plus de inhoud van Klantenservice beheren en anderen een Klantenservice-rol geven." }),

  // --- Commerciële Zaken ---------------------------------------------------------
  def({ key: "cz-alleen-lezen", section: "Commerciële Zaken", kind: "niveau", rank: 1, short: "Alleen lezen", commercial: cz("alleen-lezen"), description: "Dossiers, contacten, kansen, tegenprestaties en taken bekijken. Geen bedragen en geen contractdocumenten." }),
  def({ key: "cz-medewerker", section: "Commerciële Zaken", kind: "niveau", rank: 2, short: "Medewerker", commercial: cz("relatiebeheerder"), description: "Relaties, contacten, kansen, tegenprestaties, taken en bestanden beheren; contracten, bedragen en rapportages lezen." }),
  def({ key: "cz-beheerder", section: "Commerciële Zaken", kind: "niveau", rank: 3, short: "Beheerder", commercial: [...ALL_PERMISSIONS].sort(), description: "Alles binnen Commerciële Zaken, inclusief rechten van anderen (alleen wat je zelf hebt)." }),
  def({ key: "cz-contracten", section: "Commerciële Zaken", kind: "taak", rank: 10, short: "Contracten", commercial: cz("contractbeheerder"), description: "Contracten en contractdocumenten beheren, inclusief bedragen." }),
  def({ key: "cz-financien", section: "Commerciële Zaken", kind: "taak", rank: 11, short: "Financiën", commercial: cz("financieel-medewerker"), description: "Facturen, creditnota's en betalingen beheren en versturen." }),
  def({ key: "cz-mailings", section: "Commerciële Zaken", kind: "taak", rank: 12, short: "Mailings", commercial: cz("mailingbeheerder"), description: "Mailings voorbereiden en resultaten inzien (verzenden is een aparte bevoegdheid)." }),

  // --- HHC Tickets ---------------------------------------------------------------
  def({ key: "tickets-alleen-lezen", section: "HHC Tickets", kind: "niveau", rank: 1, short: "Alleen lezen", tickets: tk("alleen-lezen"), description: "Dashboard, wedstrijden, tickettypes en het ticketoverzicht bekijken, zonder contactgegevens." }),
  def({ key: "tickets-uitgever", section: "HHC Tickets", kind: "niveau", rank: 2, short: "Medewerker", tickets: tk("ticketuitgever"), description: "Alleen lezen, plus tickets uitgeven (ook via CSV), opnieuw versturen en contactgegevens zien." }),
  def({ key: "tickets-beheerder", section: "HHC Tickets", kind: "niveau", rank: 3, short: "Beheerder", tickets: tk("ticketbeheerder"), description: "Alles binnen HHC Tickets (wedstrijden, tickettypes, uitgifte, ontwerp, scanners, instellingen), behalve omzetcijfers." }),
  def({ key: "tickets-scanner", section: "HHC Tickets", kind: "taak", rank: 10, short: "Scanner", tickets: tk("scanner"), description: "Met een Hub-account scannen bij de ingang en een notitie toevoegen. Geen tweestapsverificatie nodig." }),
  def({ key: "tickets-scannercoordinator", section: "HHC Tickets", kind: "taak", rank: 11, short: "Scannercoördinator", tickets: tk("scannercoordinator"), description: "Scanners en ingangen beheren, scanhistorie bekijken en scans overrulen." }),
  def({ key: "tickets-ontwerper", section: "HHC Tickets", kind: "taak", rank: 12, short: "Ontwerp", tickets: withRequired(["dashboard:read", "events:read", "types:read", "design:publish"]), description: "Ticketontwerpen en standaarden bewerken en publiceren (mobiel en A4). Geen persoonsgegevens." }),
  def({ key: "tickets-rapportages", section: "HHC Tickets", kind: "taak", rank: 13, short: "Financiële rapportages", tickets: tk("financieel"), description: "Rapportages, omzetcijfers en exports. Geen wijzigingen." }),
];

export function standardRole(key: string | null | undefined): StandardRole | undefined {
  return key ? STANDARD_ROLES.find((r) => r.key === key) : undefined;
}

export function standardRolesOf(section: Section): StandardRole[] {
  return STANDARD_ROLES.filter((r) => r.section === section).sort((a, b) => a.rank - b.rank);
}

const sameSet = (a: readonly string[] | null | undefined, b: readonly string[] | null | undefined) => {
  if (a == null || b == null) return a == null && b == null;
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((p) => y.has(p));
};

/** Geeft deze rol precies wat de standaard zegt? (Anders is hij aangepast.) */
export function matchesStandard(
  s: Pick<StandardRole, "hubLevel" | "ticketingLevel" | "commercial" | "tickets">,
  r: { hubLevel: string; ticketingLevel: string; commercial: readonly string[] | null; tickets?: readonly string[] | null },
): boolean {
  return s.hubLevel === r.hubLevel && s.ticketingLevel === r.ticketingLevel && sameSet(s.commercial, r.commercial) && sameSet(s.tickets, r.tickets ?? null);
}

// --- Overzetten naar deze indeling (eenmalig, zie migrateToCompactRoles) ---------------

/** Hoe we de bestaande rol vinden die een standaardrol wordt (op herkomst, nooit op naam alleen). */
export type LegacySource =
  /** Oude standaardrol met deze presetKey (PR #90). */
  | { presetKey: string }
  /** Rol gekoppeld aan de CZ-rol met deze sleutel. */
  | { commercialKey: string }
  /** Rol die precies dit onderdeelniveau geeft en verder niets; bij voorkeur met deze oude naam. */
  | { exact: { hubLevel: SectionLevel; ticketingLevel: SectionLevel }; preferName: string[] };

export const LEGACY_SOURCES: Record<string, LegacySource> = {
  "comm-medewerker": { exact: { hubLevel: "USER", ticketingLevel: "NONE" }, preferName: ["Communicatie"] },
  "comm-beheerder": { exact: { hubLevel: "ADMIN", ticketingLevel: "NONE" }, preferName: ["Communicatiebeheerder"] },
  "ks-basis": { exact: { hubLevel: "NONE", ticketingLevel: "USER" }, preferName: ["Klantenservice", "Ticketing"] },
  "ks-medewerker": { presetKey: "ks-medewerker" },
  "ks-teamleider": { presetKey: "ks-teamleider" },
  "ks-beheerder": { exact: { hubLevel: "NONE", ticketingLevel: "ADMIN" }, preferName: ["Klantenservicebeheerder", "Ticketingbeheerder"] },
  "cz-alleen-lezen": { commercialKey: "alleen-lezen" },
  "cz-medewerker": { commercialKey: "relatiebeheerder" },
  "cz-beheerder": { commercialKey: "beheerder" },
  "cz-contracten": { commercialKey: "contractbeheerder" },
  "cz-financien": { commercialKey: "financieel-medewerker" },
  "cz-mailings": { commercialKey: "mailingbeheerder" },
  "tickets-alleen-lezen": { presetKey: "tickets-alleen-lezen" },
  "tickets-uitgever": { presetKey: "tickets-uitgever" },
  "tickets-beheerder": { presetKey: "tickets-beheerder" },
  "tickets-scanner": { presetKey: "tickets-scanner" },
  "tickets-scannercoordinator": { presetKey: "tickets-scannercoordinator" },
  "tickets-ontwerper": { presetKey: "tickets-ontwerper" },
  "tickets-rapportages": { presetKey: "tickets-rapportages" },
};

/** Oude standaardrollen zonder plek in de nieuwe indeling: weg als niemand ze heeft, anders blijven ze als eigen rol (met deze naam). */
export const RETIRED_COMMERCIAL: Record<string, string> = {
  sponsorcommissielid: "Commerciële Zaken – dossiers bewerken",
};
