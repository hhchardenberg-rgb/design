import { ApiError, requireUser } from "@/lib/api-guards";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { hasRole, isSectionAdmin, type AppRole } from "@/lib/roles";

export type ManagedSection = "hub" | "ticketing";

/** De gewone gebruikersrol van een onderdeel, die een beheerder van dat onderdeel zelf mag toekennen. */
export const SECTION_BASE_ROLE: Record<ManagedSection, AppRole> = { hub: "HUB", ticketing: "TICKETING" };
export const SECTION_ADMIN_ROLE: Record<ManagedSection, AppRole> = { hub: "HUB_ADMIN", ticketing: "TICKETING_ADMIN" };

export interface UserManager {
  user: Awaited<ReturnType<typeof requireUser>>;
  /** Hoofdadmin: beheert alle accounts en alle rollen. */
  full: boolean;
  /** Onderdelen waarvan deze gebruiker de beheerder is (zonder hoofdadmin). */
  sections: ManagedSection[];
  /** Beheerder van Commerciële Zaken (rechtenbeheer). */
  commercial: boolean;
}

/**
 * Wie mag gebruikers beheren, en hoever? Eén beheer voor alles: de hoofdadmin doet accounts en alle rollen,
 * een beheerder van een onderdeel regelt alleen wie bij dat onderdeel hoort.
 */
export async function requireUserManager(): Promise<UserManager> {
  const user = await requireUser();
  const full = hasRole(user.roles, "ADMIN");
  const sections = (["hub", "ticketing"] as const).filter((s) => !full && isSectionAdmin(user.roles, s));
  const commercial = !full && isCommercialEnabled() && (await loadCommercialAccess(user.id)).can("rights:manage_rights");
  if (!full && sections.length === 0 && !commercial) throw new ApiError(403, "Alleen voor beheerders.");
  return { user, full, sections, commercial };
}

/** Rollen die deze beheerder te zien krijgt (en kan wijzigen: alleen de gewone rollen). */
export function visibleRoles(m: UserManager): AppRole[] {
  if (m.full) return ["ADMIN", "HUB", "HUB_ADMIN", "TICKETING", "TICKETING_ADMIN"];
  return m.sections.flatMap((s) => [SECTION_BASE_ROLE[s], SECTION_ADMIN_ROLE[s]]);
}
