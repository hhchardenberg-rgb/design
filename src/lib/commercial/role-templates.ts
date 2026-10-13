// Standaard roltemplates: startpunten, geen onwrikbare regels. Ze worden één
// keer in de database gezet (ensureSystemRoles) en daarna mag de sectie ze
// aanpassen. Een rol is niets anders dan een lijst concrete bevoegdheden.

import { ALL_PERMISSIONS, permissionsForLevel, perm, type Permission } from "./permissions";

export interface RoleTemplate {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}

const edit = (...areas: Parameters<typeof permissionsForLevel>[0][]) => areas.flatMap((a) => permissionsForLevel(a, "edit"));
const read = (...areas: Parameters<typeof permissionsForLevel>[0][]) => areas.flatMap((a) => permissionsForLevel(a, "read"));

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: "alleen-lezen",
    name: "Alleen lezen",
    description: "Dossiers, contacten, kansen, tegenprestaties en taken bekijken. Geen bedragen, geen contractdocumenten.",
    permissions: read("companies", "contacts", "history", "opportunities", "counterparts", "tasks", "files"),
  },
  {
    key: "sponsorcommissielid",
    name: "Sponsorcommissielid",
    description: "Dossiers, contacten, contacthistorie en taken bewerken; contracten alleen lezen. Geen financiën.",
    permissions: [...edit("companies", "contacts", "history", "tasks"), ...read("opportunities", "contracts", "counterparts", "files")],
  },
  {
    key: "relatiebeheerder",
    name: "Relatiebeheerder",
    description: "Relaties, kansen, tegenprestaties en bestanden beheren; contracten en bedragen lezen.",
    permissions: [
      ...edit("companies", "contacts", "history", "opportunities", "counterparts", "tasks", "files"),
      ...read("contracts", "amounts", "reports"),
      perm("files", "download"),
    ],
  },
  {
    key: "contractbeheerder",
    name: "Contractbeheerder",
    description: "Contracten en contractdocumenten beheren, inclusief bedragen. Definitief maken is een aparte bevoegdheid.",
    permissions: [
      ...edit("contracts", "contract_documents", "counterparts", "amounts"),
      ...read("companies", "contacts", "history", "tasks", "files"),
      perm("contract_documents", "download"),
    ],
  },
  {
    key: "financieel-medewerker",
    name: "Financieel medewerker",
    description: "Facturen (concept tot verzenden), creditnota's en betalingen beheren. Rechten beheren zit hier niet bij.",
    permissions: [
      ...edit("invoices", "payments", "credit_notes"),
      ...read("companies", "contacts", "contracts", "amounts", "reports"),
      perm("invoices", "download"),
      perm("invoices", "send"),
      perm("invoices", "approve"),
      perm("credit_notes", "download"),
      perm("credit_notes", "send"),
      perm("credit_notes", "approve"),
    ],
  },
  {
    key: "mailingbeheerder",
    name: "Mailingbeheerder",
    description: "Mailings voorbereiden en resultaten inzien, maar niet verzenden.",
    permissions: [...edit("mailings"), ...read("companies", "contacts")],
  },
  {
    key: "beheerder",
    name: "Beheerder Commerciële Zaken",
    description: "Alle bevoegdheden binnen Commerciële Zaken, inclusief rechtenbeheer (binnen de delegatiegrens).",
    permissions: [...ALL_PERMISSIONS],
  },
];

