// Onderdelen van het afgeschermde Klantenservice-gedeelte. Zelfde opzet als
// src/lib/hub-modules.ts: nieuwe categorieën kunnen hier eenvoudig aan
// toegevoegd worden zodra er een eigen pagina/databron voor is (evt. eerst
// met status "soon" als duidelijke plek in de structuur, zie hub-modules.ts
// voor dat patroon).

import type { QuickLink } from "@/components/quick-links";
import { Search, BookOpen, Mail, KeyRound, FileSpreadsheet, Smartphone, Ticket, AtSign, Newspaper, type LucideIcon } from "lucide-react";

export interface TicketingModule {
  id: string;
  title: string;
  description: string;
  href: string;
  status: "available" | "soon";
  icon: LucideIcon;
  /** Alleen zichtbaar met dit HHC Tickets-recht (server-side bepaald). */
  requires?: "support:search";
}

/** Onderdelen die deze gebruiker mag zien. */
export function visibleTicketingModules(opts: { newsEnabled: boolean; supportSearch: boolean }): TicketingModule[] {
  return ticketingModules.filter((m) => (m.id !== "nieuws" || opts.newsEnabled) && (m.requires !== "support:search" || opts.supportSearch));
}

// Snelle links naar de externe systemen die bij ticketing horen — direct
// zichtbaar op de Klantenservice-startpagina.
export const ticketingQuickLinks: QuickLink[] = [
  {
    id: "iapp",
    title: "iApp",
    description: "Ledenpas-beheer",
    href: "https://iapp.cloud/",
    icon: Smartphone,
    external: true,
  },
  {
    id: "fullhouse",
    title: "Fullhouse",
    description: "Ticketing-systeem",
    href: "https://dashboard.fullhouse.tech/",
    icon: Ticket,
    external: true,
  },
  {
    id: "hhc-mail",
    title: "HHC e-mail",
    description: "Webmail",
    href: "https://hhc.nl/mail",
    icon: AtSign,
    external: true,
  },
];

export const ticketingModules: TicketingModule[] = [
  {
    id: "zoeken",
    title: "Klant of ticket zoeken",
    description: "Zoek klanten, tickets en seizoenskaarten in het HHC-ticketsysteem en in Fullhouse.",
    href: "/klantenservice/zoeken",
    status: "available",
    icon: Search,
    requires: "support:search",
  },
  {
    // Alleen zichtbaar als het nieuws voor Klantenservice aan staat (zie src/lib/news.server.ts).
    id: "nieuws",
    title: "Nieuws",
    description: "Het laatste nieuws voor Klantenservice.",
    href: "/klantenservice/nieuws",
    status: "available",
    icon: Newspaper,
  },
  {
    id: "handleidingen",
    title: "Handleidingen",
    description: "Stap-voor-stap-instructies voor het ticketingsysteem.",
    href: "/klantenservice/handleidingen",
    status: "available",
    icon: BookOpen,
  },
  {
    id: "emails",
    title: "Standaard e-mails",
    description: "Kant-en-klare e-mailteksten om te kopiëren naar je mailprogramma.",
    href: "/klantenservice/emails",
    status: "available",
    icon: Mail,
  },
  {
    id: "wachtwoorden",
    title: "Wachtwoord genereren",
    description: "Maak een willekeurig wachtwoord voor een lid waarvoor je een pas aanmaakt.",
    href: "/klantenservice/wachtwoorden",
    status: "available",
    icon: KeyRound,
  },
  {
    id: "excel",
    title: "Excel-sjablonen",
    description: "Standaard Excel-bestanden om te downloaden bij het ticketingsysteem.",
    href: "/klantenservice/excel",
    status: "available",
    icon: FileSpreadsheet,
  },
];
