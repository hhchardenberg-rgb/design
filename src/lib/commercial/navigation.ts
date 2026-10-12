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
  { href: "/commercieel/instellingen/rechten", label: "Rechten", requires: "rights:read" },
];
