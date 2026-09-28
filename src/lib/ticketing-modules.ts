// Onderdelen van het afgeschermde Ticketing-gedeelte. Zelfde opzet als
// src/lib/hub-modules.ts: nieuwe categorieën (handleidingen, veelgestelde
// vragen, links, ...) kunnen hier eenvoudig aan toegevoegd worden zodra er
// een eigen pagina/databron voor is — tot die tijd staan ze met
// status "soon" klaar als duidelijke plek in de structuur.

import { BookOpen, HelpCircle, Link2, Phone, Megaphone, Mail, KeyRound, type LucideIcon } from "lucide-react";

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
  {
    id: "faq",
    title: "Veelvoorkomende problemen",
    description: "Snel antwoord op vragen die vaak terugkomen.",
    href: "/ticketing/faq",
    status: "soon",
    icon: HelpCircle,
  },
  {
    id: "links",
    title: "Belangrijke links",
    description: "Snelle links naar het ticketingsysteem en gerelateerde tools.",
    href: "/ticketing/links",
    status: "soon",
    icon: Link2,
  },
  {
    id: "contact",
    title: "Contactinformatie",
    description: "Wie je kunt bereiken bij vragen over ticketing.",
    href: "/ticketing/contact",
    status: "soon",
    icon: Phone,
  },
  {
    id: "mededelingen",
    title: "Mededelingen",
    description: "Belangrijke updates over het ticketingsysteem.",
    href: "/ticketing/mededelingen",
    status: "soon",
    icon: Megaphone,
  },
];
