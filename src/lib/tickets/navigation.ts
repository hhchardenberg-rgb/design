import type { TicketPermission } from "./permissions";

// Navigatie binnen HHC Tickets. Alleen schermen die er echt zijn staan in het menu; wat in
// een volgende fase komt, staat op het dashboard onder "Wat komt er nog".

export interface TicketsNavItem {
  href: string;
  label: string;
  requires: TicketPermission;
}

export interface TicketsNavGroup {
  id: string;
  label: string;
  items: TicketsNavItem[];
}

export const TICKETS_NAV: TicketsNavGroup[] = [
  {
    id: "tickets",
    label: "Tickets",
    items: [
      { href: "/tickets/uitgeven", label: "Tickets uitgeven", requires: "tickets:issue" },
      { href: "/tickets/bulk", label: "Bulkuitgifte", requires: "tickets:bulk" },
      { href: "/tickets/overzicht", label: "Ticketoverzicht", requires: "tickets:read" },
      { href: "/tickets/seizoenskaarten", label: "Seizoenskaarten", requires: "types:read" },
    ],
  },
  {
    id: "inrichting",
    label: "Inrichting",
    items: [
      { href: "/tickets/wedstrijden", label: "Wedstrijden", requires: "events:read" },
      { href: "/tickets/tickettypes", label: "Tickettypes en vakken", requires: "types:read" },
    ],
  },
  {
    id: "beheer",
    label: "Beheer",
    items: [
      { href: "/tickets/goedkeuringen", label: "Goedkeuringen", requires: "bulk:approve" },
      { href: "/tickets/instellingen", label: "Instellingen", requires: "settings:manage" },
      { href: "/tickets/auditlog", label: "Auditlog", requires: "audit:read" },
    ],
  },
];

/** Wat in een volgende fase komt, voor het dashboard. */
export const TICKETS_ROADMAP: { phase: number; title: string; items: string[] }[] = [
  { phase: 2, title: "Aflevering", items: ["Ticketmail met beveiligde link", "Persoonlijke ticketpagina met QR-code", "PDF-download", "Apple Wallet en Google Wallet", "E-mailtemplates", "Walletconfiguratie"] },
  { phase: 3, title: "Scanner", items: ["Mobiele scanner (PWA) met camera", "Scanner-PIN en ingangen", "Offline-cache", "Dubbele scans en supervisor-overrides", "Scannerbeheer"] },
  { phase: 4, title: "Fullhouse", items: ["Evenementen importeren en activeren", "Tickets van Fullhouse controleren", "Webhooks en synchronisaties", "Orders en externe tickets"] },
  { phase: 5, title: "Rapportage en uitbreiding", items: ["Rapportages en exports (CSV, Excel, PDF)", "Geplande rapportagemails", "Automatische walletupdates", "Koppeling met Commerciële Zaken"] },
];

export function visibleTicketsNav(can: (p: TicketPermission) => boolean): TicketsNavGroup[] {
  return TICKETS_NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(i.requires)) })).filter((g) => g.items.length > 0);
}
