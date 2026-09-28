// Centrale rollenconfiguratie. Edge-safe (geen Prisma/bcrypt-imports) zodat
// dit zowel in middleware.ts (Edge Runtime) als in gewone server-/client-code
// gebruikt kan worden. Een gebruiker kan nul of meer rollen tegelijk hebben
// (bv. zowel HUB als TICKETING) — zie prisma/schema.prisma (`User.roles`).
//
// Nieuwe rol toevoegen: hier een entry aan ASSIGNABLE_ROLES toevoegen, de
// waarde aan de Prisma `Role`-enum toevoegen, en (indien de rol een eigen
// afgeschermd gedeelte beschermt) een sectie toevoegen in middleware.ts.

export type AppRole = "ADMIN" | "HUB" | "TICKETING";

export interface RoleDefinition {
  value: AppRole;
  label: string;
  description: string;
}

// Volgorde bepaalt de weergavevolgorde in de checkbox-lijst bij gebruikersbeheer.
export const ASSIGNABLE_ROLES: RoleDefinition[] = [
  {
    value: "HUB",
    label: "Communicatie Hub",
    description: "Toegang tot de communicatie-hub: designtool, agenda, nieuws, kennisbank en meer.",
  },
  {
    value: "TICKETING",
    label: "Ticketing",
    description: "Toegang tot het afgeschermde Ticketing-gedeelte met handleidingen en procedures.",
  },
  {
    value: "ADMIN",
    label: "Beheerder",
    description: "Volledige toegang tot het beheergedeelte (/admin).",
  },
];

/**
 * Beheerders kunnen altijd alles zien: wie de rol ADMIN heeft, voldoet
 * hiermee automatisch aan elke andere rol-check (HUB, TICKETING, en
 * toekomstige rollen) — ook als die rol niet los is aangevinkt.
 */
export function hasRole(roles: AppRole[] | undefined | null, role: AppRole): boolean {
  if (!roles) return false;
  if (roles.includes("ADMIN")) return true;
  return roles.includes(role);
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
  if (hasRole(roles, "ADMIN")) return "/admin";
  return "/geen-toegang";
}
