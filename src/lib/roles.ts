// Centrale rollenconfiguratie. Edge-safe (geen Prisma/bcrypt-imports) zodat
// dit zowel in middleware.ts (Edge Runtime) als in gewone server-/client-code
// gebruikt kan worden. Een gebruiker kan nul of meer rollen tegelijk hebben
// (bv. zowel HUB als TICKETING) — zie prisma/schema.prisma (`User.roles`).
//
// Let op: dit zijn de technische rolwaarden in het inlogtoken. Welke rollen
// beheerders aanmaken en toewijzen staat in src/lib/access (tabel access_roles);
// daaruit wordt `User.roles` bij elke wijziging afgeleid.

export type AppRole = "ADMIN" | "HUB" | "TICKETING" | "HUB_ADMIN" | "TICKETING_ADMIN";

// Opzet: drie onderdelen (Communicatie, Ticketing, Commerciële Zaken).
//  - HUB / TICKETING: toegang tot dat onderdeel.
//  - HUB_ADMIN / TICKETING_ADMIN: beheert de inhoud en de gebruikers van dat onderdeel.
//  - ADMIN (hoofdadmin): ziet en beheert alles, ook Commerciële Zaken.
// Commerciële Zaken heeft geen eigen waarde hier: die rechten komen per verzoek uit de database.

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
