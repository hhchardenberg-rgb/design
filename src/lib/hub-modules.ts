// Centrale module-configuratie voor de HHC Hardenberg Hub. Nieuwe onderdelen
// (aangeleverd door Team Communicatie) kunnen hier simpelweg aan de lijst
// worden toegevoegd — de hub-startpagina en de navigatie renderen deze
// automatisch, zonder dat er op meerdere plekken code hoeft te veranderen.

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
    id: "huisstijl",
    title: "Huisstijl",
    description: "De officiële HHC Hardenberg-huisstijlkleuren en lettertypen, om te gebruiken buiten de designtool.",
    href: "/huisstijl",
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
    id: "kalender",
    title: "Agenda",
    description: "Activiteiten en planning, live verbonden met de Google Agenda van HHC Hardenberg.",
    href: "/kalender",
    status: "available",
  },
  {
    id: "contacten",
    title: "Contactpersonen",
    description: "Wie doet wat binnen Team Communicatie en hoe bereik je elkaar.",
    href: "#",
    status: "soon",
  },
  {
    id: "bestanden",
    title: "Bestanden & downloads",
    description: "Logo's, foto's en andere bestanden om te hergebruiken.",
    href: "#",
    status: "soon",
  },
];
