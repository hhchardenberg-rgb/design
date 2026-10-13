import type { Permission } from "./permissions";

// Navigatie binnen Commerciële Zaken. Onderdelen komen hier pas bij zodra ze
// echt gebouwd zijn: geen menu-items naar schermen die nog niet bestaan.
export interface CommercialNavItem {
  href: string;
  label: string;
  /** Alleen tonen met deze bevoegdheid; ontbreekt = voor elk lid. */
  requires?: Permission;
}

export const COMMERCIAL_NAV: CommercialNavItem[] = [
  { href: "/commercieel", label: "Dashboard" },
  { href: "/commercieel/sponsoren", label: "Sponsoren", requires: "companies:read" },
  { href: "/commercieel/pijplijn", label: "Pijplijn", requires: "opportunities:read" },
  { href: "/commercieel/contracten", label: "Contracten", requires: "contracts:read" },
  { href: "/commercieel/indexatie", label: "Indexatie", requires: "amounts:read" },
  { href: "/commercieel/facturen", label: "Facturen", requires: "invoices:read" },
  { href: "/commercieel/mailings", label: "Mailings", requires: "mailings:read" },
  { href: "/commercieel/rapportages", label: "Rapportages", requires: "reports:read" },
  { href: "/commercieel/taken", label: "Taken", requires: "tasks:read" },
  { href: "/commercieel/instellingen/seizoenen", label: "Seizoenen en pakketten", requires: "contracts:read" },
  { href: "/commercieel/instellingen/facturatie", label: "Facturatie", requires: "settings:read" },
  { href: "/commercieel/instellingen/teams", label: "Teams", requires: "settings:read" },
  { href: "/commercieel/instellingen/rechten", label: "Rechten", requires: "rights:read" },
];
