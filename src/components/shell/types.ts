import type { LucideIcon } from "lucide-react";

export interface ShellNavItem {
  title: string;
  href: string;
  icon?: LucideIcon;
  status?: "available" | "soon";
  external?: boolean;
}

export interface ShellNavGroup {
  id: string;
  label: string;
  items: ShellNavItem[];
}

/** Eén onderdeel ("app") van de Hub met zijn eigen menu in de zijbalk. */
export interface ShellSection {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Naam van de startpagina van het onderdeel in het menu. */
  homeLabel: string;
  groups: ShellNavGroup[];
}

/** Platte menudata die server-side (op rechten) wordt bepaald. */
export interface PlainNavGroup {
  id: string;
  label: string;
  items: { href: string; label: string }[];
}

/** Eerstvolgende wedstrijd voor de wedstrijdchip en het overzicht. */
export interface NextMatch {
  id: string;
  home: string;
  away: string;
  isHome: boolean;
  date: string;
  competition: string | null;
}
