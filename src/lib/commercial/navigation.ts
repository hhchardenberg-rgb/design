import type { Permission } from "./permissions";

// Navigatie binnen Commerciële Zaken, gegroepeerd zoals het werk loopt:
// relaties, afspraken, geld, communicatie en instellingen. Onderdelen komen hier
// pas bij zodra ze echt gebouwd zijn: geen menu-items naar schermen die nog niet bestaan.
export interface CommercialNavItem {
  href: string;
  label: string;
  /** Korte uitleg, getoond op de startpagina. */
  description: string;
  /** Alleen tonen met deze bevoegdheid; ontbreekt = voor elk lid. */
  requires?: Permission;
}

export interface CommercialNavGroup {
  id: string;
  label: string;
  items: CommercialNavItem[];
}

export const COMMERCIAL_NAV_GROUPS: CommercialNavGroup[] = [
  {
    id: "relaties",
    label: "Relaties",
    items: [
      { href: "/commercieel/sponsoren", label: "Sponsoren", description: "Dossiers, contactpersonen, historie en bestanden.", requires: "companies:read" },
      { href: "/commercieel/pijplijn", label: "Pijplijn", description: "Acquisitiekansen van eerste contact tot ondertekening.", requires: "opportunities:read" },
      { href: "/commercieel/taken", label: "Taken", description: "Afspraken en opvolging, met herinneringen per e-mail.", requires: "tasks:read" },
    ],
  },
  {
    id: "afspraken",
    label: "Afspraken",
    items: [
      { href: "/commercieel/contracten", label: "Contracten", description: "Contracten per seizoen met tegenprestaties.", requires: "contracts:read" },
      { href: "/commercieel/tegenprestaties", label: "Tegenprestaties", description: "Wat HHC dit seizoen nog moet leveren, met afvinken.", requires: "counterparts:read" },
      { href: "/commercieel/indexatie", label: "Indexatie", description: "Verlengingen met een aangepast bedrag.", requires: "amounts:read" },
    ],
  },
  {
    id: "financien",
    label: "Financiën",
    items: [
      { href: "/commercieel/facturen", label: "Facturen", description: "Facturen, creditnota's en betalingen.", requires: "invoices:read" },
      { href: "/commercieel/rapportages", label: "Rapportages", description: "Inkomsten per seizoen en pijplijnstand, met export.", requires: "reports:read" },
    ],
  },
  {
    id: "communicatie",
    label: "Communicatie",
    items: [{ href: "/commercieel/mailings", label: "Mailings", description: "Mailings naar sponsorcontacten met afmelden.", requires: "mailings:read" }],
  },
  {
    id: "toezicht",
    label: "Toezicht",
    items: [
      { href: "/commercieel/toezicht/personen", label: "Per persoon", description: "Openstaande taken, kansen en tegenprestaties per persoon.", requires: "rights:manage_rights" },
      { href: "/commercieel/toezicht/logboek", label: "Logboek", description: "Wie heeft wat gedaan: wijzigingen, verzendingen en downloads.", requires: "rights:manage_rights" },
    ],
  },
  {
    id: "instellingen",
    label: "Instellingen",
    items: [
      { href: "/commercieel/instellingen/seizoenen", label: "Seizoenen en pakketten", description: "Seizoenen en sponsorpakketten met tegenprestaties.", requires: "contracts:read" },
      { href: "/commercieel/instellingen/teams", label: "Teams", description: "Teams voor het recordbereik “eigen team”.", requires: "settings:read" },
      { href: "/commercieel/instellingen/facturatie", label: "Facturatie", description: "Gegevens van de vereniging, betaaltermijn en nummering.", requires: "settings:read" },
    ],
  },
];

/** De groepen en onderdelen waar dit lid bij mag, zonder lege groepen. */
export function visibleNavGroups(can: (p: Permission) => boolean): CommercialNavGroup[] {
  return COMMERCIAL_NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.requires || can(i.requires)) })).filter((g) => g.items.length > 0);
}
