// Centrale rollenconfiguratie. Edge-safe (geen Prisma/bcrypt-imports) zodat
// dit zowel in middleware.ts (Edge Runtime) als in gewone server-/client-code
// gebruikt kan worden. Een gebruiker kan nul of meer rollen tegelijk hebben
// (bv. zowel HUB als TICKETING) — zie prisma/schema.prisma (`User.roles`).
//
// Nieuwe rol toevoegen: hier een entry aan ASSIGNABLE_ROLES toevoegen, de
// waarde aan de Prisma `Role`-enum toevoegen, en (indien de rol een eigen
// afgeschermd gedeelte beschermt) een sectie toevoegen in middleware.ts.

export type AppRole = "ADMIN" | "HUB" | "TICKETING" | "HUB_ADMIN" | "TICKETING_ADMIN";

export interface RoleDefinition {
  value: AppRole;
  label: string;
  description: string;
}

// Opzet: drie onderdelen (Communicatie, Ticketing, Commerciële Zaken), één beheer.
//  - Gebruiker: ziet alleen de onderdelen waar die bij is aangesloten.
//  - Beheerder per onderdeel (HUB_ADMIN, TICKETING_ADMIN, en "Beheerder Commerciële Zaken" binnen die sectie):
//    beheert de inhoud en de gebruikers van alleen dat onderdeel.
//  - Hoofdadmin (ADMIN): ziet en beheert alles, ook Commerciële Zaken.
// Volgorde bepaalt de weergavevolgorde in de checkbox-lijst bij gebruikersbeheer.
export const ASSIGNABLE_ROLES: RoleDefinition[] = [
  {
    value: "HUB",
    label: "Communicatie",
    description: "Toegang tot de communicatie-hub: designtool, agenda, nieuws, kennisbank en meer.",
  },
  {
    value: "HUB_ADMIN",
    label: "Communicatiebeheerder",
    description: "Beheert de inhoud en de gebruikers van Communicatie (en heeft er zelf toegang toe).",
  },
  {
    value: "TICKETING",
    label: "Ticketing",
    description: "Toegang tot het afgeschermde Ticketing-gedeelte met handleidingen en procedures.",
  },
  {
    value: "TICKETING_ADMIN",
    label: "Ticketingbeheerder",
    description: "Beheert de inhoud en de gebruikers van Ticketing (en heeft er zelf toegang toe).",
  },
  {
    value: "ADMIN",
    label: "Hoofdadmin",
    description: "Ziet en beheert alles: alle onderdelen, inclusief Commerciële Zaken, en alle gebruikers.",
  },
];

/** Welke rol "inbegrepen" is in een andere: een beheerder van een onderdeel heeft ook toegang tot dat onderdeel. */
const IMPLIED_BY: Partial<Record<AppRole, AppRole[]>> = {
  HUB: ["HUB_ADMIN"],
  TICKETING: ["TICKETING_ADMIN"],
};

/**
 * Hoofdadmins kunnen altijd alles zien: wie de rol ADMIN heeft, voldoet
 * hiermee automatisch aan elke andere rol-check. Een beheerder van een
 * onderdeel voldoet ook aan de gewone rol van dat onderdeel.
 */
export function hasRole(roles: AppRole[] | undefined | null, role: AppRole): boolean {
  if (!roles) return false;
  if (roles.includes("ADMIN")) return true;
  if (roles.includes(role)) return true;
  return (IMPLIED_BY[role] ?? []).some((r) => roles.includes(r));
}

/** Hoofdadmin, of beheerder van precies dit onderdeel. */
export function isSectionAdmin(roles: AppRole[] | undefined | null, section: "hub" | "ticketing"): boolean {
  if (!roles) return false;
  return roles.includes("ADMIN") || roles.includes(section === "hub" ? "HUB_ADMIN" : "TICKETING_ADMIN");
}

/** Mag deze gebruiker het beheergedeelte (/admin) in, in welke vorm dan ook? Commerciële beheerders worden apart bepaald. */
export function hasAnyAdminRole(roles: AppRole[] | undefined | null): boolean {
  return !!roles && (roles.includes("ADMIN") || roles.includes("HUB_ADMIN") || roles.includes("TICKETING_ADMIN"));
}

/**
 * Vertaalt het legacy enkelvoudige `role`-veld naar een rollenset, voor
 * gebruikers die nog niet gemigreerd zijn (roles is dan leeg — `[]`). Zodra
 * `roles` expliciet is gezet (via het beheerscherm of de eenmalige
 * backfill), is dát leidend en wordt deze fallback niet meer gebruikt.
 * ADMIN kreeg voorheen impliciet ook toegang tot de hele hub (zie de
 * "Naar hub"-knop) — die bestaande toegang blijft hiermee behouden.
 */
export function effectiveRoles(user: { role: string; roles: string[] }): AppRole[] {
  if (user.roles.length > 0) return user.roles as AppRole[];
  return user.role === "ADMIN" ? ["ADMIN", "HUB"] : ["HUB"];
}

/** Waar een gebruiker met deze rollen naartoe moet na inloggen / bij een geweigerde toegang. */
export function resolveHomePath(roles: AppRole[] | undefined | null): string {
  if (hasRole(roles, "HUB")) return "/hub";
  if (hasRole(roles, "TICKETING")) return "/ticketing";
  if (hasAnyAdminRole(roles)) return "/admin";
  return "/geen-toegang";
}
