// Centrale module-configuratie voor de HHC Hardenberg Hub. Nieuwe onderdelen
// (aangeleverd door Team Communicatie) kunnen hier simpelweg aan een groep
// worden toegevoegd — de hub-startpagina en het apps-menu in de header
// renderen dit automatisch, zonder dat er op meerdere plekken code hoeft te
// veranderen. Gegroepeerd (in plaats van één platte lijst) zodat het
// apps-menu overzichtelijk blijft naarmate er meer onderdelen bij komen.

import {
  Palette,
  CalendarDays,
  Newspaper,
  Users,
  Images,
  SwatchBook,
  BookOpen,
  FileText,
  Timer,
  AlertTriangle,
  Megaphone,
  type LucideIcon,
} from "lucide-react";

export interface HubModule {
  id: string;
  title: string;
  description: string;
  href: string;
  status: "available" | "soon";
  icon: LucideIcon;
}

export interface HubModuleGroup {
  id: string;
  label: string;
  modules: HubModule[];
}

// De designtool is het meestgebruikte onderdeel en krijgt daarom altijd
// een eigen, prominente plek (zowel op de hub-homepage als bovenaan het
// apps-menu) in plaats van tussen de andere onderdelen te staan.
export const featuredModule: HubModule = {
  id: "designtool",
  title: "Designtool",
  description: "Maak in een paar klikken clubafbeeldingen op basis van templates: wedstrijdgrafieken, opstellingen, uitslagen en meer.",
  href: "/dashboard",
  status: "available",
  icon: Palette,
};

export const hubModuleGroups: HubModuleGroup[] = [
  {
    id: "communicatie",
    label: "Communicatie & planning",
    modules: [
      {
        id: "kalender",
        title: "Agenda",
        description: "Activiteiten en planning, live verbonden met de Google Agenda van HHC Hardenberg.",
        href: "/kalender",
        status: "available",
        icon: CalendarDays,
      },
      {
        id: "nieuws",
        title: "Nieuws",
        description: "Het laatste nieuws voor Team Communicatie: nieuwe designs, sponsoren, vrijwilligers en meer.",
        href: "/nieuws",
        status: "available",
        icon: Newspaper,
      },
      {
        id: "contacten",
        title: "Contactpersonen",
        description: "Wie doet wat binnen Team Communicatie en hoe bereik je elkaar.",
        href: "/contactpersonen",
        status: "available",
        icon: Users,
      },
      {
        id: "persberichten",
        title: "Persberichten",
        description: "Stel een persbericht op in de vaste HHC-huisstijl en exporteer het als Word of PDF.",
        href: "/persberichten",
        status: "available",
        icon: Megaphone,
      },
    ],
  },
  {
    id: "bronnen",
    label: "Bronnen & hulpmiddelen",
    modules: [
      {
        id: "fotobank",
        title: "Fotobank",
        description: "Standaardfoto's om te gebruiken in je content.",
        href: "/fotobank",
        status: "available",
        icon: Images,
      },
      {
        id: "huisstijl",
        title: "Huisstijl",
        description: "De officiële HHC Hardenberg-huisstijlkleuren en lettertypen, om te gebruiken buiten de designtool.",
        href: "/huisstijl",
        status: "available",
        icon: SwatchBook,
      },
      {
        id: "kennisbank",
        title: "Kennisbank",
        description: "De HHC Communicatie-wiki: handleidingen en werkwijzen, met zoekfunctie.",
        href: "/kennisbank",
        status: "available",
        icon: BookOpen,
      },
      {
        id: "docs",
        title: "Documentatie",
        description: "Uitleg en handleidingen voor vrijwilligers van Team Communicatie, zoals de PSD-conventies voor nieuwe templates.",
        href: "/docs",
        status: "available",
        icon: FileText,
      },
      {
        id: "stopwatch",
        title: "Stopwatch",
        description: "Wedstrijdklok met helften, verlengingen en automatische blessuretijd.",
        href: "/stopwatch",
        status: "available",
        icon: Timer,
      },
    ],
  },
  {
    id: "crisis",
    label: "Crisiscommunicatie",
    modules: [
      {
        id: "crisis",
        title: "Crisiscommunicatie",
        description: "Protocollen per incidenttype: wie bellen, en wie mag hierover communiceren.",
        href: "/crisis",
        status: "available",
        icon: AlertTriangle,
      },
    ],
  },
];

// Platte lijst (incl. featuredModule) voor plekken die simpelweg "alle
// onderdelen" nodig hebben, zonder groepering.
export const hubModules: HubModule[] = [featuredModule, ...hubModuleGroups.flatMap((g) => g.modules)];
