// Groepsconfiguratie voor het beheergedeelte, gebruikt door zowel het
// apps-menu in de header (binnen /admin) als de beheer-overzichtspagina
// (/admin). Zelfde opzet als src/lib/hub-modules.ts, zodat nieuwe
// beheerpagina's op één plek toegevoegd kunnen worden.

import {
  LayoutTemplate,
  CalendarDays,
  Newspaper,
  Images,
  BookOpen,
  AlertTriangle,
  Users,
  Trophy,
  Shield,
  Type,
  SwatchBook,
  UserCog,
  FileText,
  Ticket,
  DatabaseBackup,
  ScrollText,
  Share2,
  type LucideIcon,
} from "lucide-react";
import { hasRole, isSectionAdmin, type AppRole } from "@/lib/roles";

export interface AdminModule {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  // Bij welk onderdeel dit beheer hoort. "systeem" is voor alle beheerders
  // (de pagina zelf bepaalt wat je er mag zien en doen). "hoofdadmin" is alleen voor de hoofdadmin.
  section: "hub" | "ticketing" | "systeem" | "hoofdadmin";
}

export interface AdminModuleGroup {
  id: string;
  label: string;
  modules: AdminModule[];
}

export const adminModuleGroups: AdminModuleGroup[] = [
  {
    id: "content",
    label: "Content",
    modules: [
      { title: "Templates", description: "PSD-templates importeren en beheren.", href: "/admin/templates", icon: LayoutTemplate, section: "hub" },
      { title: "Agenda", description: "Agendapunten toevoegen en uitlichten.", href: "/admin/agenda", icon: CalendarDays, section: "hub" },
      { title: "Nieuws", description: "Nieuws plaatsen voor de onderdelen van de Hub, en per onderdeel aan of uit zetten.", href: "/admin/nieuws", icon: Newspaper, section: "systeem" },
      { title: "Fotobank", description: "Standaardfoto's uploaden en beheren.", href: "/admin/fotobank", icon: Images, section: "hub" },
      { title: "Kennisbank", description: "Handleidingen en werkwijzen beheren.", href: "/admin/kennisbank", icon: BookOpen, section: "hub" },
      { title: "Crisiscommunicatie", description: "Protocollen per incidenttype beheren.", href: "/admin/crisis", icon: AlertTriangle, section: "hub" },
      { title: "Contactpersonen", description: "Wie doet wat binnen Team Communicatie.", href: "/admin/contactpersonen", icon: Users, section: "hub" },
      { title: "Social media", description: "Links naar de social media-kanalen op de Communicatie-startpagina.", href: "/admin/social-media", icon: Share2, section: "hub" },
      {
        title: "Ticketing",
        description: "Handleidingen en standaard e-mails voor het ticketingsysteem beheren.",
        href: "/admin/ticketing",
        icon: Ticket,
        section: "ticketing",
      },
    ],
  },
  {
    id: "club",
    label: "Club",
    modules: [
      { title: "Wedstrijden", description: "Duels, uitslagen en planning.", href: "/admin/matches", icon: Trophy, section: "hub" },
      { title: "Club & teams", description: "Teams, spelers en tegenstanders.", href: "/admin/clubs", icon: Shield, section: "hub" },
    ],
  },
  {
    id: "huisstijl",
    label: "Huisstijl",
    modules: [
      { title: "Fonts", description: "Lettertypen uploaden en beheren.", href: "/admin/fonts", icon: Type, section: "hub" },
      { title: "Huisstijlkleuren", description: "Officiële kleuren beheren.", href: "/admin/colors", icon: SwatchBook, section: "hub" },
    ],
  },
  {
    id: "systeem",
    label: "Systeem",
    modules: [
      { title: "Gebruikers en rechten", description: "Accounts en rollen: wie mag wat in welk onderdeel van de Hub.", href: "/admin/users", icon: UserCog, section: "systeem" },
      { title: "Audit-log", description: "Wie deed wat: inloggen, beveiliging, accounts en rollen, back-ups en downloads.", href: "/admin/audit", icon: ScrollText, section: "hoofdadmin" },
      { title: "Back-ups", description: "Automatische, versleutelde back-ups van alle gegevens; handmatig een back-up maken of downloaden.", href: "/admin/backups", icon: DatabaseBackup, section: "hoofdadmin" },
      { title: "Documentatie", description: "PSD-conventies en handleidingen.", href: "/docs", icon: FileText, section: "hub" },
    ],
  },
];

/**
 * De beheeronderdelen die deze gebruiker te zien krijgt: de hoofdadmin alles, een beheerder van een
 * onderdeel alleen dat onderdeel, en iedereen met beheerrechten (ook van Commerciële Zaken) het
 * gebruikersbeheer.
 */
export function visibleAdminGroups(roles: AppRole[] | undefined | null, canManageCommercial = false): AdminModuleGroup[] {
  const can = (section: AdminModule["section"]) => {
    if (section === "hoofdadmin") return hasRole(roles, "ADMIN");
    if (section === "systeem") return hasRole(roles, "ADMIN") || isSectionAdmin(roles, "hub") || isSectionAdmin(roles, "ticketing") || canManageCommercial;
    return isSectionAdmin(roles, section);
  };
  return adminModuleGroups
    .map((g) => ({ ...g, modules: g.modules.filter((m) => can(m.section)) }))
    .filter((g) => g.modules.length > 0);
}
