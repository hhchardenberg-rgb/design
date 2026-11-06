import type { AppRole } from "@/lib/roles";

// Sessie- en tweestapsregels. Edge-safe (geen Prisma), want de routebewaking (src/proxy.ts) gebruikt ze ook.

/** Een sessie vervalt na 7 dagen zonder gebruik (bij gebruik schuift de termijn op). */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
/** Hoe vaak het sessiecookie bij gebruik vernieuwd wordt. */
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60;
/** Beheerders loggen na 12 uur altijd opnieuw in, ook als ze actief zijn. */
export const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;

/** Beheerrollen: strengere sessieduur en verplichte tweestapsverificatie. */
export function isElevated(roles: readonly string[] | null | undefined): boolean {
  return !!roles && roles.some((r) => r === "ADMIN" || r === "HUB_ADMIN" || r === "TICKETING_ADMIN");
}

/** Moet dit account tweestapsverificatie hebben? Beheerders en iedereen met toegang tot Commerciële Zaken. */
export function mfaRequired(roles: readonly AppRole[] | null | undefined, commercialMember: boolean): boolean {
  return isElevated(roles) || commercialMember;
}

/** Waar iemand zonder (verplichte) tweestapsverificatie nog wel mag komen: precies genoeg om die in te stellen. */
export const MFA_SETUP_PATH = "/account/security";
export function allowedDuringMfaSetup(pathname: string): boolean {
  return pathname.startsWith("/account") || pathname.startsWith("/api/account") || pathname.startsWith("/api/auth");
}

export function adminSessionExpired(roles: readonly string[] | null | undefined, authAt: number | undefined, now = Date.now()): boolean {
  return isElevated(roles) && typeof authAt === "number" && now - authAt > ADMIN_SESSION_MS;
}
