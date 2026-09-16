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
  type LucideIcon,
} from "lucide-react";

export interface AdminModule {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
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
      { title: "Templates", description: "PSD-templates importeren en beheren.", href: "/admin/templates", icon: LayoutTemplate },
      { title: "Agenda", description: "Agendapunten toevoegen en uitlichten.", href: "/admin/agenda", icon: CalendarDays },
      { title: "Nieuws", description: "Nieuwsberichten plaatsen en vastzetten.", href: "/admin/nieuws", icon: Newspaper },
      { title: "Fotobank", description: "Standaardfoto's uploaden en beheren.", href: "/admin/fotobank", icon: Images },
      { title: "Kennisbank", description: "Handleidingen en werkwijzen beheren.", href: "/admin/kennisbank", icon: BookOpen },
      { title: "Crisiscommunicatie", description: "Protocollen per incidenttype beheren.", href: "/admin/crisis", icon: AlertTriangle },
      { title: "Contactpersonen", description: "Wie doet wat binnen Team Communicatie.", href: "/admin/contactpersonen", icon: Users },
    ],
  },
  {
    id: "club",
    label: "Club",
    modules: [
      { title: "Wedstrijden", description: "Duels, uitslagen en planning.", href: "/admin/matches", icon: Trophy },
      { title: "Club & teams", description: "Teams, spelers en tegenstanders.", href: "/admin/clubs", icon: Shield },
    ],
  },
  {
    id: "huisstijl",
    label: "Huisstijl",
    modules: [
      { title: "Fonts", description: "Lettertypen uploaden en beheren.", href: "/admin/fonts", icon: Type },
      { title: "Huisstijlkleuren", description: "Officiële kleuren beheren.", href: "/admin/colors", icon: SwatchBook },
    ],
  },
  {
    id: "systeem",
    label: "Systeem",
    modules: [
      { title: "Gebruikers", description: "Accounts en beheerderstoegang.", href: "/admin/users", icon: UserCog },
      { title: "Documentatie", description: "PSD-conventies en handleidingen.", href: "/docs", icon: FileText },
    ],
  },
];
