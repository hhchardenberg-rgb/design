// Kant-en-klare standaardrollen voor Klantenservice en HHC Tickets. Ze worden één
// keer in de database gezet (zie ensureStandardRoles in service.server.ts) en zijn
// daarna gewone rollen: een beheerder mag ze aanpassen, kopiëren of verwijderen.
// Een verwijderde standaardrol komt niet vanzelf terug. Bestaande gebruikers krijgen
// er nooit automatisch een; toewijzen gebeurt altijd door een beheerder.

import type { SectionLevel } from "./model";
import { TICKET_ROLE_TEMPLATES, withRequired, type TicketPermission } from "@/lib/tickets/permissions";

export interface StandardRole {
  key: string;
  /** Kopje in het scherm Rollen. */
  group: "Klantenservice" | "HHC Tickets";
  name: string;
  description: string;
  ticketingLevel: SectionLevel;
  /** null = geen toegang tot HHC Tickets. */
  tickets: TicketPermission[] | null;
}

const template = (key: string): TicketPermission[] => {
  const t = TICKET_ROLE_TEMPLATES.find((x) => x.key === key);
  if (!t) throw new Error(`Onbekend ticketsjabloon: ${key}`);
  return t.permissions;
};

export const STANDARD_ROLES: StandardRole[] = [
  // --- Klantenservice -------------------------------------------------------------
  {
    key: "ks-medewerker",
    group: "Klantenservice",
    name: "Klantenservicemedewerker",
    description:
      "Klantenservice gebruiken (handleidingen, mails) en klanten en tickets zoeken in HHC en Fullhouse, met contactgegevens. Kan tickets opnieuw versturen.",
    ticketingLevel: "USER",
    tickets: withRequired(["support:search", "tickets:read", "tickets:personal", "tickets:resend"]),
  },
  {
    key: "ks-teamleider",
    group: "Klantenservice",
    name: "Klantenservice-teamleider",
    description:
      "Alles van een klantenservicemedewerker, plus een vervangend ticket uitgeven, tickets blokkeren of heractiveren en de scanhistorie van een ticket bekijken.",
    ticketingLevel: "USER",
    tickets: withRequired(["dashboard:read", "support:search", "tickets:personal", "tickets:resend", "tickets:issue", "tickets:block", "scan:history"]),
  },
  // --- HHC Tickets ----------------------------------------------------------------
  {
    key: "tickets-beheerder",
    group: "HHC Tickets",
    name: "Ticketbeheerder",
    description: "Alles binnen HHC Tickets (wedstrijden, tickettypes, uitgifte, ontwerp, scanners, instellingen), behalve omzetcijfers en rechten van anderen.",
    ticketingLevel: "NONE",
    tickets: template("ticketbeheerder"),
  },
  {
    key: "tickets-uitgever",
    group: "HHC Tickets",
    name: "Ticketuitgever",
    description: "Tickets uitgeven (ook via CSV), opnieuw versturen en het ticketoverzicht met contactgegevens bekijken.",
    ticketingLevel: "NONE",
    tickets: template("ticketuitgever"),
  },
  {
    key: "tickets-ontwerper",
    group: "HHC Tickets",
    name: "Ticketontwerper",
    description: "Ticketontwerpen en standaarden bewerken en publiceren (mobiel en A4). Geen uitgifte en geen persoonsgegevens.",
    ticketingLevel: "NONE",
    tickets: withRequired(["dashboard:read", "events:read", "types:read", "design:publish"]),
  },
  {
    key: "tickets-scannercoordinator",
    group: "HHC Tickets",
    name: "Scannercoördinator",
    description: "Supervisor bij de ingangen: scanners en ingangen beheren, scanhistorie bekijken en scans overrulen.",
    ticketingLevel: "NONE",
    tickets: template("scannercoordinator"),
  },
  {
    key: "tickets-scanner",
    group: "HHC Tickets",
    name: "Scanner",
    description: "Met een Hub-account op de scanner: een ingang kiezen, scannen en een notitie toevoegen. Vrijwilligers zonder account gebruiken een scannercode met pincode.",
    ticketingLevel: "NONE",
    tickets: template("scanner"),
  },
  {
    key: "tickets-rapportages",
    group: "HHC Tickets",
    name: "Ticketrapportages",
    description: "Dashboard, rapportages en omzetcijfers bekijken en exporteren. Geen wijzigingen.",
    ticketingLevel: "NONE",
    tickets: template("financieel"),
  },
  {
    key: "tickets-alleen-lezen",
    group: "HHC Tickets",
    name: "Tickets alleen lezen",
    description: "Dashboard, wedstrijden, tickettypes en het ticketoverzicht bekijken, zonder contactgegevens.",
    ticketingLevel: "NONE",
    tickets: template("alleen-lezen"),
  },
];

export function standardRole(key: string | null | undefined): StandardRole | undefined {
  return key ? STANDARD_ROLES.find((r) => r.key === key) : undefined;
}
