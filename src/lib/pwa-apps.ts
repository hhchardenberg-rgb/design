import type { Metadata } from "next";

/**
 * De onderdelen van de Hub die je los als app op je telefoon kunt zetten (PWA).
 *
 * Elke app heeft een eigen manifest (public/apps/<key>/manifest.webmanifest), eigen naam,
 * eigen icoon, eigen startpagina en een eigen scope: de app hoort alleen bij zijn eigen
 * onderdeel (de Scanner alleen /scan). Communicatie heeft scope "/", omdat dat onderdeel over
 * veel paden verspreid is (/hub, /templates, /kalender, ...). Inloggen en tweestapsverificatie
 * liggen buiten een smalle scope; de telefoon toont die pagina's dan even met een balk
 * bovenin en keert daarna terug naar de app. Het `id` onderscheidt de apps. Iconen en manifesten maak je opnieuw met scripts/generate-app-icons.tsx.
 */
export type PwaAppKey = "communicatie" | "commercieel" | "klantenservice" | "tickets" | "scanner";

export interface PwaApp {
  key: PwaAppKey;
  /** Volledige naam (installatievenster, app-overzicht). */
  name: string;
  /** Naam onder het icoon op het beginscherm (kort houden, ±12 tekens). */
  shortName: string;
  description: string;
  startUrl: string;
  /** Welk deel van de Hub bij deze app hoort; alles daarbuiten is "buiten de app". */
  scope: string;
  /** Vaste identiteit van de app; verandert nooit (anders ziet de telefoon hem als nieuwe app). */
  id: string;
  /** Sleutel van het onderdeel in de app-shell (zijbalk). */
  sectionKey: string | null;
  manifest: string;
  orientation?: "portrait";
  /** Donkere statusbalk (scanner) of lichte (Hub-onderdelen, lichte kopbalk). */
  dark: boolean;
}

const base = (key: PwaAppKey) => `/apps/${key}`;

export const PWA_APPS: Record<PwaAppKey, PwaApp> = {
  communicatie: {
    key: "communicatie",
    name: "HHC Communicatie",
    shortName: "Communicatie",
    description: "Team Communicatie van HHC Hardenberg: ontwerpen, nieuws, agenda en huisstijl.",
    startUrl: "/hub",
    scope: "/",
    id: "/hub",
    sectionKey: "hub",
    manifest: `${base("communicatie")}/manifest.webmanifest`,
    dark: false,
  },
  commercieel: {
    key: "commercieel",
    name: "HHC Commerciële Zaken",
    shortName: "Commercieel",
    description: "Sponsorbeheer, contracten, facturen en taken van HHC Hardenberg.",
    startUrl: "/commercieel",
    scope: "/commercieel",
    id: "/commercieel",
    sectionKey: "commercial",
    manifest: `${base("commercieel")}/manifest.webmanifest`,
    dark: false,
  },
  klantenservice: {
    key: "klantenservice",
    name: "HHC Klantenservice",
    shortName: "Klantenservice",
    description: "Handleidingen, standaardmails en de zoektool van Klantenservice van HHC Hardenberg.",
    startUrl: "/klantenservice",
    scope: "/klantenservice",
    id: "/klantenservice",
    sectionKey: "ticketing",
    manifest: `${base("klantenservice")}/manifest.webmanifest`,
    dark: false,
  },
  tickets: {
    key: "tickets",
    name: "HHC Tickets",
    shortName: "HHC Tickets",
    description: "Tickets, wedstrijden, gastenlijsten en scans van HHC Hardenberg.",
    startUrl: "/tickets",
    scope: "/tickets",
    id: "/tickets",
    sectionKey: "tickets",
    manifest: `${base("tickets")}/manifest.webmanifest`,
    dark: false,
  },
  scanner: {
    key: "scanner",
    name: "HHC Scanner",
    shortName: "HHC Scanner",
    description: "Tickets scannen bij de poort van HHC Hardenberg.",
    // Zelfde id als de eerdere scanner-app, zodat al geïnstalleerde scanners gewoon bijwerken.
    startUrl: "/scan",
    scope: "/scan",
    id: "/scan",
    sectionKey: null,
    manifest: `${base("scanner")}/manifest.webmanifest`,
    orientation: "portrait",
    dark: true,
  },
};

/** Kleur van de app-balk: HHC-zwart, zoals de zijbalk (Dug-out). */
export const PWA_THEME_COLOR = "#0b0b0b";

export function pwaAppForSection(sectionKey: string | undefined | null): PwaApp | null {
  if (!sectionKey) return null;
  return Object.values(PWA_APPS).find((a) => a.sectionKey === sectionKey) ?? null;
}

/** Metadata voor een layout: koppelt het juiste manifest en de iconen (ook voor iPhone) aan dat onderdeel. */
export function pwaMetadata(key: PwaAppKey): Pick<Metadata, "manifest" | "icons" | "appleWebApp"> {
  const app = PWA_APPS[key];
  const b = base(key);
  return {
    manifest: app.manifest,
    // Het tabblad-icoon blijft het clublogo; alleen het beginschermicoon (iPhone) is per app.
    icons: {
      icon: [{ url: "/icon.png", type: "image/png" }],
      apple: [{ url: `${b}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: { capable: true, title: app.shortName, statusBarStyle: app.dark ? "black-translucent" : "default" },
  };
}
