// Onderdelen van het afgeschermde Ticketing-gedeelte. Zelfde opzet als
// src/lib/hub-modules.ts: nieuwe categorieën kunnen hier eenvoudig aan
// toegevoegd worden zodra er een eigen pagina/databron voor is (evt. eerst
// met status "soon" als duidelijke plek in de structuur, zie hub-modules.ts
// voor dat patroon).

import { BookOpen, Mail, KeyRound, type LucideIcon } from "lucide-react";

export interface TicketingModule {
  id: string;
  title: string;
  description: string;
  href: string;
  status: "available" | "soon";
  icon: LucideIcon;
}

export const ticketingModules: TicketingModule[] = [
  {
    id: "handleidingen",
    title: "Handleidingen",
    description: "Stap-voor-stap-instructies voor het ticketingsysteem.",
    href: "/ticketing/handleidingen",
    status: "available",
    icon: BookOpen,
  },
  {
    id: "emails",
    title: "Standaard e-mails",
    description: "Kant-en-klare e-mailteksten om te kopiëren naar je mailprogramma.",
    href: "/ticketing/emails",
    status: "available",
    icon: Mail,
  },
  {
    id: "wachtwoorden",
    title: "Wachtwoord genereren",
    description: "Maak een willekeurig wachtwoord voor een lid waarvoor je een pas aanmaakt.",
    href: "/ticketing/wachtwoorden",
    status: "available",
    icon: KeyRound,
  },
];
