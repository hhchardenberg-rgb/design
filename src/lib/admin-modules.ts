// Groepsconfiguratie voor het beheergedeelte, gebruikt door zowel het
// apps-menu in de header (binnen /admin) als de beheer-overzichtspagina
// (/admin). Zelfde opzet als src/lib/hub-modules.ts, zodat nieuwe
// beheerpagina's op één plek toegevoegd kunnen worden.

export interface AdminModule {
  title: string;
  description: string;
  href: string;
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
      { title: "Templates", description: "PSD-templates importeren en beheren.", href: "/admin/templates" },
      { title: "Agenda", description: "Agendapunten toevoegen en uitlichten.", href: "/admin/agenda" },
      { title: "Nieuws", description: "Nieuwsberichten plaatsen en vastzetten.", href: "/admin/nieuws" },
      { title: "Fotobank", description: "Standaardfoto's uploaden en beheren.", href: "/admin/fotobank" },
      { title: "Kennisbank", description: "Handleidingen en werkwijzen beheren.", href: "/admin/kennisbank" },
      { title: "Crisiscommunicatie", description: "Protocollen per incidenttype beheren.", href: "/admin/crisis" },
      { title: "Contactpersonen", description: "Wie doet wat binnen Team Communicatie.", href: "/admin/contactpersonen" },
    ],
  },
  {
    id: "club",
    label: "Club",
    modules: [
      { title: "Wedstrijden", description: "Duels, uitslagen en planning.", href: "/admin/matches" },
      { title: "Club & teams", description: "Teams, spelers en tegenstanders.", href: "/admin/clubs" },
    ],
  },
  {
    id: "huisstijl",
    label: "Huisstijl",
    modules: [
      { title: "Fonts", description: "Lettertypen uploaden en beheren.", href: "/admin/fonts" },
      { title: "Huisstijlkleuren", description: "Officiële kleuren beheren.", href: "/admin/colors" },
    ],
  },
  {
    id: "systeem",
    label: "Systeem",
    modules: [
      { title: "Gebruikers", description: "Accounts en beheerderstoegang.", href: "/admin/users" },
      { title: "Documentatie", description: "PSD-conventies en handleidingen.", href: "/docs" },
    ],
  },
];
