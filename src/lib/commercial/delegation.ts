// Delegatiegrenzen voor rechtenbeheer (opdracht 4.5). Zuivere regels zonder
// database, zodat ze volledig testbaar zijn. De aanroepende service haalt de
// feiten op (effectieve rechten van de actor, aantal beheerders) en laat
// hier beslissen.
//
// Uitgangspunten:
//  - Sectietoegang (lidmaatschap) geven of intrekken kan alleen een
//    platformbeheerder; dat geeft op zichzelf geen inhoudelijke rechten.
//  - Rechten van anderen aanpassen vereist 'rights:manage_rights'.
//  - Je kunt je eigen rechten niet aanpassen.
//  - Je kunt alleen bevoegdheden toekennen die je zelf effectief hebt.
//  - Blokkeren (rechten afnemen) mag altijd, behalve bij jezelf.
//  - Er blijft altijd minstens één lid met 'rights:manage_rights' over.

import type { Permission } from "./permissions";

export type Decision = { ok: true } | { ok: false; message: string };
const ok: Decision = { ok: true };
const no = (message: string): Decision => ({ ok: false, message });

export interface Actor {
  userId: string;
  isPlatformAdmin: boolean;
  /** Effectieve bevoegdheden binnen Commerciële Zaken (leeg zonder lidmaatschap). */
  effective: ReadonlySet<Permission>;
}

export function canManageRights(actor: Actor): boolean {
  return actor.effective.has("rights:manage_rights");
}

/** Rol toewijzen of individuele uitzondering 'toestaan' instellen voor een ander lid. */
export function checkGrant(actor: Actor, targetUserId: string, granting: readonly Permission[]): Decision {
  if (!canManageRights(actor)) return no("Je mag geen rechten beheren binnen Commerciële Zaken.");
  if (actor.userId === targetUserId) return no("Je kunt je eigen rechten niet aanpassen. Vraag een andere beheerder.");
  const beyond = granting.filter((p) => !actor.effective.has(p));
  if (beyond.length > 0) {
    return no(`Je kunt alleen rechten toekennen die je zelf hebt. Buiten jouw grens: ${beyond.join(", ")}.`);
  }
  return ok;
}

/** Rechten afnemen (blokkade instellen of uitzondering verwijderen). */
export function checkRestrict(actor: Actor, targetUserId: string): Decision {
  if (!canManageRights(actor)) return no("Je mag geen rechten beheren binnen Commerciële Zaken.");
  if (actor.userId === targetUserId) return no("Je kunt je eigen rechten niet aanpassen. Vraag een andere beheerder.");
  return ok;
}

/**
 * Een nieuwe rol toewijzen is een toekenning van alle bevoegdheden van die rol.
 * Een rol wijzigen die al in gebruik is, geldt voor de hele rol: de actor moet
 * binnen de grens blijven voor de nieuwe bevoegdheden.
 */
export function checkAssignRole(actor: Actor, targetUserId: string, rolePermissions: readonly Permission[]): Decision {
  return checkGrant(actor, targetUserId, rolePermissions);
}

export function checkEditRole(actor: Actor, addedPermissions: readonly Permission[], affectsSelf: boolean): Decision {
  if (!canManageRights(actor)) return no("Je mag geen rechten beheren binnen Commerciële Zaken.");
  if (affectsSelf) return no("Deze rol is ook aan jou toegewezen; laat een andere beheerder dit aanpassen.");
  const beyond = addedPermissions.filter((p) => !actor.effective.has(p));
  if (beyond.length > 0) return no(`Je kunt alleen rechten toevoegen die je zelf hebt. Buiten jouw grens: ${beyond.join(", ")}.`);
  return ok;
}

/** Lidmaatschap (sectietoegang) geven of intrekken. */
export function checkMembershipChange(
  actor: Actor,
  kind: "grant" | "revoke",
  opts: { targetIsLastRightsManager?: boolean } = {},
): Decision {
  if (!actor.isPlatformAdmin) return no("Alleen een platformbeheerder kan toegang tot Commerciële Zaken geven of intrekken.");
  if (kind === "revoke" && opts.targetIsLastRightsManager) {
    return no("Dit is het laatste lid dat rechten kan beheren. Wijs eerst iemand anders aan.");
  }
  return ok;
}

/** Het wijzigen van rechten mag nooit het laatste rechtenbeheer wegnemen. */
export function checkNotRemovingLastRightsManager(wouldRemoveManageRights: boolean, otherManagers: number): Decision {
  if (wouldRemoveManageRights && otherManagers < 1) {
    return no("Dit zou het laatste lid zonder rechtenbeheer achterlaten. Wijs eerst iemand anders aan.");
  }
  return ok;
}
