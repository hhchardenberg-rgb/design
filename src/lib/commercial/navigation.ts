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
  { href: "/commercieel/taken", label: "Taken", requires: "tasks:read" },
  { href: "/commercieel/instellingen/teams", label: "Teams", requires: "settings:read" },
  { href: "/commercieel/instellingen/rechten", label: "Rechten", requires: "rights:read" },
];
