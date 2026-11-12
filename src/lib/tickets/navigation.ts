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
      { href: "/tickets/rapportages", label: "Rapportages en export", requires: "reports:read" },
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
    id: "scannen",
    label: "Scannen",
    items: [
      { href: "/scan", label: "Scanner openen", requires: "scan:scan" },
      { href: "/tickets/wedstrijddag", label: "Wedstrijddag (live)", requires: "scan:history" },
      { href: "/tickets/scans", label: "Scanhistorie", requires: "scan:history" },
      { href: "/tickets/scanners", label: "Scanners en ingangen", requires: "scanners:manage" },
    ],
  },
  {
    id: "beheer",
    label: "Beheer",
    items: [
      { href: "/tickets/fullhouse", label: "Fullhouse", requires: "sync:read" },
      { href: "/tickets/templates", label: "E-mail en wallet", requires: "templates:manage" },
      { href: "/tickets/goedkeuringen", label: "Goedkeuringen", requires: "bulk:approve" },
      { href: "/tickets/instellingen", label: "Instellingen", requires: "settings:manage" },
      { href: "/tickets/auditlog", label: "Auditlog", requires: "audit:read" },
    ],
  },
];

/** Wat in een volgende fase komt, voor het dashboard. */
export const TICKETS_ROADMAP: { phase: number; title: string; items: string[] }[] = [
  { phase: 2, title: "Wallet", items: ["Apple Wallet en Google Wallet (wachten op de accounts van HHC)", "Automatische walletupdates bij wijzigingen"] },
  { phase: 5, title: "Uitbreiding", items: ["Geplande rapportagemails", "Scherm voor Commerciële Zaken om tickets uit te geven (de koppeling zelf staat klaar)"] },
];

export function visibleTicketsNav(can: (p: TicketPermission) => boolean): TicketsNavGroup[] {
  return TICKETS_NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(i.requires)) })).filter((g) => g.items.length > 0);
}
