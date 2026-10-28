import { ApiError, requireUser } from "@/lib/api-guards";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { hasRole, isSectionAdmin, type AppRole } from "@/lib/roles";
import type { ManagerScope } from "@/lib/access/model";
import type { AccessActor } from "@/lib/access/service.server";

export type ManagedSection = "hub" | "ticketing";

export interface UserManager {
  user: Awaited<ReturnType<typeof requireUser>>;
  /** Hoofdadmin: beheert alle accounts en alle rollen. */
  full: boolean;
  /** Onderdelen waarvan deze gebruiker de beheerder is (zonder hoofdadmin). */
  sections: ManagedSection[];
  /** Beheerder van Commerciële Zaken (rechtenbeheer). */
  commercial: boolean;
  /** Wat deze beheerder mag toewijzen en aanpassen (zie src/lib/access/model.ts). */
  scope: ManagerScope;
  actor: AccessActor;
}

/** Wat deze gebruiker als beheerder mag toewijzen en aanpassen; `null` als hij nergens beheerder van is. */
export async function managerFor(user: { id: string; name?: string | null; email?: string | null; roles: string[] }): Promise<Omit<UserManager, "user"> | null> {
  const full = hasRole(user.roles as AppRole[], "ADMIN");
  const sections = (["hub", "ticketing"] as const).filter((s) => !full && isSectionAdmin(user.roles as AppRole[], s));
  const access = !full && isCommercialEnabled() ? await loadCommercialAccess(user.id) : null;
  const commercial = !!access?.can("rights:manage_rights");
  if (!full && sections.length === 0 && !commercial) return null;
  const scope: ManagerScope = {
    userId: user.id,
    full,
    hubAdmin: full || sections.includes("hub"),
    ticketingAdmin: full || sections.includes("ticketing"),
    commercialManage: full || commercial,
    commercialGrantable: new Set(commercial && access ? [...access.allowed] : []),
  };
  return { full, sections, commercial, scope, actor: { scope, label: user.name || user.email || user.id } };
}

/**
 * Wie mag gebruikers en rollen beheren, en hoever? De hoofdadmin doet alles; een beheerder
 * van een onderdeel wijst alleen rollen toe die binnen dat onderdeel blijven.
 */
export async function requireUserManager(): Promise<UserManager> {
  const user = await requireUser();
  const manager = await managerFor(user);
  if (!manager) throw new ApiError(403, "Alleen voor beheerders.");
  return { user, ...manager };
}
