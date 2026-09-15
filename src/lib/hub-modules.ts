// Centrale module-configuratie voor de HHC Hardenberg Hub. Nieuwe onderdelen
// (aangeleverd door Team Communicatie) kunnen hier simpelweg aan de lijst
// worden toegevoegd — de hub-startpagina, het apps-menu in de header en de
// navigatie renderen deze automatisch, zonder dat er op meerdere plekken
// code hoeft te veranderen.

export interface HubModule {
  id: string;
  title: string;
  description: string;
  href: string;
  status: "available" | "soon";
}

export const hubModules: HubModule[] = [
  {
    id: "designtool",
    title: "Designtool",
    description: "Maak in een paar klikken clubafbeeldingen op basis van templates: wedstrijdgrafieken, opstellingen, uitslagen en meer.",
    href: "/dashboard",
    status: "available",
  },
  {
    id: "kalender",
    title: "Agenda",
    description: "Activiteiten en planning, live verbonden met de Google Agenda van HHC Hardenberg.",
    href: "/kalender",
    status: "available",
  },
  {
    id: "nieuws",
    title: "Nieuws",
    description: "Het laatste nieuws voor Team Communicatie: nieuwe designs, sponsoren, vrijwilligers en meer.",
    href: "/nieuws",
    status: "available",
  },
  {
    id: "fotobank",
    title: "Fotobank",
    description: "Standaardfoto's om te gebruiken in je content.",
    href: "/fotobank",
    status: "available",
  },
  {
    id: "huisstijl",
    title: "Huisstijl",
    description: "De officiële HHC Hardenberg-huisstijlkleuren en lettertypen, om te gebruiken buiten de designtool.",
    href: "/huisstijl",
    status: "available",
  },
  {
    id: "kennisbank",
    title: "Kennisbank",
    description: "De HHC Communicatie-wiki: handleidingen en werkwijzen, met zoekfunctie.",
    href: "/kennisbank",
    status: "available",
  },
  {
    id: "crisis",
    title: "Crisiscommunicatie",
    description: "Protocollen per incidenttype: wie bellen, en wie mag hierover communiceren.",
    href: "/crisis",
    status: "available",
  },
  {
    id: "stopwatch",
    title: "Stopwatch",
    description: "Wedstrijdklok met helften, verlengingen en automatische blessuretijd.",
    href: "/stopwatch",
    status: "available",
  },
  {
    id: "docs",
    title: "Documentatie",
    description: "Uitleg en handleidingen voor vrijwilligers van Team Communicatie, zoals de PSD-conventies voor nieuwe templates.",
    href: "/docs",
    status: "available",
  },
  {
    id: "contacten",
    title: "Contactpersonen",
    description: "Wie doet wat binnen Team Communicatie en hoe bereik je elkaar.",
    href: "#",
    status: "soon",
  },
];
