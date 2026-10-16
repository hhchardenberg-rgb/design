import { hasRole, isSectionAdmin, type AppRole } from "@/lib/roles";

/**
 * Bevoegdheden binnen de designtool, afgeleid van de bestaande Hub-rollen.
 * Alleen Communicatie telt: rechten in andere onderdelen (Ticketing,
 * Commerciële Zaken) geven hier niets, en andersom.
 *
 *  - design:create        ontwerpen maken en eigen ontwerpen beheren (Communicatie)
 *  - design:manage-team   ontwerpen van anderen openen, bewerken en verwijderen
 *  - template:edit        PSD importeren, conceptversies bewerken en testen
 *  - template:activate    een versie actief maken voor gebruikers
 *  - brand:manage         lettertypen, huisstijlkleuren en clubmedia beheren
 */
export type DesignCapability =
  | "design:create"
  | "design:manage-team"
  | "template:edit"
  | "template:activate"
  | "brand:manage";

export function designCapabilities(roles: AppRole[] | null | undefined): Set<DesignCapability> {
  const caps = new Set<DesignCapability>();
  if (hasRole(roles, "HUB")) caps.add("design:create");
  if (isSectionAdmin(roles, "hub")) {
    caps.add("design:create");
    caps.add("design:manage-team");
    caps.add("template:edit");
    caps.add("template:activate");
    caps.add("brand:manage");
  }
  return caps;
}

export function canDesign(roles: AppRole[] | null | undefined, cap: DesignCapability): boolean {
  return designCapabilities(roles).has(cap);
}

/** Mag deze gebruiker dit ontwerp openen, opslaan, renderen en downloaden? */
export function canAccessDesign(
  user: { id: string; roles: AppRole[] | null | undefined },
  design: { userId: string }
): boolean {
  if (design.userId === user.id) return canDesign(user.roles, "design:create");
  return canDesign(user.roles, "design:manage-team");
}
