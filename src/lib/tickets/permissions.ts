// Bevoegdheden binnen HHC Tickets. Pure TypeScript zonder imports, zodat dit in
// server-code, client-code en tests bruikbaar is. Een bevoegdheid is "<gebied>:<actie>".
// De hoofdadmin (superadmin) heeft automatisch alles; ieder ander krijgt
// bevoegdheden via een rol in Beheer > Gebruikers en rechten.

export interface TicketPermissionInfo {
  label: string;
  group: "Overzicht" | "Tickets" | "Scannen" | "Inrichting" | "Rapportage" | "Beheer";
  /** Risicovol of privacygevoelig: in de rolbewerker gemarkeerd. */
  sensitive?: boolean;
}

export const TICKET_PERMISSIONS = {
  "dashboard:read": { label: "Dashboard bekijken", group: "Overzicht" },
  "events:read": { label: "Wedstrijden bekijken", group: "Inrichting" },
  "events:manage": { label: "Wedstrijden beheren", group: "Inrichting" },
  "types:read": { label: "Tickettypes, vakken en seizoenen bekijken", group: "Inrichting" },
  "types:manage": { label: "Tickettypes, vakken en seizoenen beheren", group: "Inrichting" },
  "tickets:read": { label: "Ticketoverzicht bekijken (zonder contactgegevens)", group: "Tickets" },
  "tickets:personal": { label: "Contactgegevens van tickethouders zien", group: "Tickets", sensitive: true },
  "tickets:issue": { label: "Tickets uitgeven", group: "Tickets" },
  "tickets:bulk": { label: "Bulkuitgifte aanvragen (CSV)", group: "Tickets" },
  "bulk:approve": { label: "Grote bulkuitgiftes goedkeuren", group: "Tickets", sensitive: true },
  "tickets:block": { label: "Tickets blokkeren, annuleren en heractiveren", group: "Tickets", sensitive: true },
  "tickets:resend": { label: "Tickets opnieuw versturen of opnieuw uitgeven", group: "Tickets" },
  "tickets:anonymize": { label: "Persoonsgegevens anonimiseren", group: "Tickets", sensitive: true },
  "scan:scan": { label: "Tickets scannen", group: "Scannen" },
  "scan:note": { label: "Scannotitie toevoegen", group: "Scannen" },
  "scan:history": { label: "Scanhistorie bekijken", group: "Scannen" },
  "scan:override": { label: "Scan overrulen (supervisor)", group: "Scannen", sensitive: true },
  "scanners:manage": { label: "Scanners en ingangen beheren", group: "Scannen" },
  "templates:manage": { label: "E-mailtemplates beheren", group: "Beheer" },
  "wallet:manage": { label: "Walletconfiguratie beheren", group: "Beheer", sensitive: true },
  "reports:read": { label: "Rapportages bekijken", group: "Rapportage" },
  "reports:revenue": { label: "Omzetcijfers bekijken", group: "Rapportage", sensitive: true },
  "exports:export": { label: "Exporteren (CSV, Excel, PDF)", group: "Rapportage", sensitive: true },
  "sync:read": { label: "Synchronisaties bekijken", group: "Beheer" },
  "sync:manage": { label: "Fullhouse-synchronisatie en evenementen beheren", group: "Beheer", sensitive: true },
  "settings:manage": { label: "Instellingen beheren", group: "Beheer", sensitive: true },
  "audit:read": { label: "Auditlog bekijken", group: "Beheer", sensitive: true },
} as const satisfies Record<string, TicketPermissionInfo>;

export type TicketPermission = keyof typeof TICKET_PERMISSIONS;
export const ALL_TICKET_PERMISSIONS = Object.keys(TICKET_PERMISSIONS) as TicketPermission[];
const ALL = new Set<string>(ALL_TICKET_PERMISSIONS);

export function isTicketPermission(v: string): v is TicketPermission {
  return ALL.has(v);
}

/** Bevoegdheden die alleen werken samen met een andere (bv. uitgeven vereist het overzicht). */
const REQUIRES: Partial<Record<TicketPermission, TicketPermission[]>> = {
  "events:manage": ["events:read"],
  "types:manage": ["types:read"],
  "tickets:personal": ["tickets:read"],
  "tickets:issue": ["tickets:read", "events:read", "types:read"],
  "tickets:bulk": ["tickets:issue"],
  "bulk:approve": ["tickets:read"],
  "tickets:block": ["tickets:read"],
  "tickets:resend": ["tickets:read"],
  "tickets:anonymize": ["tickets:personal"],
  "scan:note": ["scan:scan"],
  "scan:override": ["scan:history"],
  "reports:revenue": ["reports:read"],
  "sync:manage": ["sync:read"],
};

export function ticketPermissionIssues(perms: Iterable<string>): string[] {
  const set = new Set(perms);
  const out: string[] = [];
  for (const p of set) {
    if (!isTicketPermission(p)) {
      out.push(`Onbekende bevoegdheid: ${p}.`);
      continue;
    }
    for (const r of REQUIRES[p] ?? []) {
      if (!set.has(r)) out.push(`'${TICKET_PERMISSIONS[p].label}' werkt alleen samen met '${TICKET_PERMISSIONS[r].label}'.`);
    }
  }
  return out;
}

/** Vult vereiste bevoegdheden automatisch aan (handig bij sjablonen en vinkjes). */
export function withRequired(perms: Iterable<string>): TicketPermission[] {
  const set = new Set<TicketPermission>([...perms].filter(isTicketPermission));
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of [...set]) {
      for (const r of REQUIRES[p] ?? []) {
        if (!set.has(r)) {
          set.add(r);
          grew = true;
        }
      }
    }
  }
  return ALL_TICKET_PERMISSIONS.filter((p) => set.has(p));
}

/** Verplichte tweestapsverificatie voor iedereen die meer mag dan scannen (scanners zijn vaak vrijwilligers). */
export function ticketsNeedsMfa(perms: Iterable<string>): boolean {
  for (const p of perms) if (isTicketPermission(p) && p !== "scan:scan" && p !== "scan:note") return true;
  return false;
}

export interface TicketRoleTemplate {
  key: string;
  name: string;
  description: string;
  permissions: TicketPermission[];
}

const SCANNER: TicketPermission[] = ["scan:scan", "scan:note"];

/** De gevraagde rollen als sjablonen. Superadmin = de bestaande rol Hoofdadmin (heeft alles). */
export const TICKET_ROLE_TEMPLATES: TicketRoleTemplate[] = [
  {
    key: "ticketbeheerder",
    name: "Ticketbeheerder",
    description: "Alles binnen HHC Tickets, behalve rechten van anderen.",
    permissions: ALL_TICKET_PERMISSIONS.filter((p) => p !== "reports:revenue"),
  },
  {
    key: "ticketuitgever",
    name: "Ticketuitgever",
    description: "Tickets uitgeven (ook via CSV), opnieuw versturen en het overzicht bekijken.",
    permissions: withRequired(["dashboard:read", "tickets:personal", "tickets:issue", "tickets:bulk", "tickets:resend"]),
  },
  {
    key: "scannercoordinator",
    name: "Scannercoördinator",
    description: "Scanners en ingangen beheren, scanhistorie bekijken en scans overrulen.",
    permissions: withRequired(["dashboard:read", "events:read", ...SCANNER, "scan:history", "scan:override", "scanners:manage"]),
  },
  {
    key: "scanner",
    name: "Scanner",
    description: "Alleen inloggen op de scanner, een ingang kiezen, scannen en een notitie toevoegen.",
    permissions: withRequired(SCANNER),
  },
  {
    key: "financieel",
    name: "Financieel beheerder",
    description: "Rapportages, omzetcijfers en exports.",
    permissions: withRequired(["dashboard:read", "events:read", "types:read", "reports:read", "reports:revenue", "exports:export"]),
  },
  {
    key: "communicatie",
    name: "Communicatiebeheerder",
    description: "E-mailtemplates beheren en tickets opnieuw versturen.",
    permissions: withRequired(["dashboard:read", "events:read", "tickets:personal", "tickets:resend", "templates:manage"]),
  },
  {
    key: "bestuur",
    name: "Bestuur / directie",
    description: "Dashboard en rapportages, alleen lezen.",
    permissions: withRequired(["dashboard:read", "events:read", "types:read", "reports:read", "reports:revenue"]),
  },
  {
    key: "alleen-lezen",
    name: "Alleen lezen",
    description: "Dashboard, wedstrijden en tickettypes bekijken, zonder persoonsgegevens.",
    permissions: withRequired(["dashboard:read", "events:read", "types:read", "tickets:read"]),
  },
];
