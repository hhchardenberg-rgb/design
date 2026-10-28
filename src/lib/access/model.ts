// Eén rollensysteem voor de hele Hub — de zuivere regels, zonder database, zodat
// ze volledig testbaar zijn. Een rol zegt per onderdeel wat iemand mag:
//  - Communicatie en Ticketing: geen toegang, gebruiker of beheerder;
//  - Commerciële Zaken: geen toegang, of toegang met een set bevoegdheden;
//  - de vaste rol Hoofdadmin: alles.
// Een gebruiker kan meerdere rollen hebben; de rechten tellen op.

import type { AppRole } from "@/lib/roles";
import { isPermission, type Permission } from "@/lib/commercial/permissions";

export type SectionLevel = "NONE" | "USER" | "ADMIN";
export const SECTION_LEVELS: SectionLevel[] = ["NONE", "USER", "ADMIN"];
export const LEVEL_LABELS: Record<SectionLevel, string> = { NONE: "Geen toegang", USER: "Gebruiker", ADMIN: "Beheerder" };

export function isSectionLevel(v: unknown): v is SectionLevel {
  return v === "NONE" || v === "USER" || v === "ADMIN";
}

/** Wat een rol inhoudt, los van hoe die is opgeslagen. */
export interface RoleGrant {
  isAdmin: boolean;
  hubLevel: SectionLevel;
  ticketingLevel: SectionLevel;
  /** null = geen toegang tot Commerciële Zaken. */
  commercial: string[] | null;
}

const RANK: Record<SectionLevel, number> = { NONE: 0, USER: 1, ADMIN: 2 };
const higher = (a: SectionLevel, b: SectionLevel): SectionLevel => (RANK[a] >= RANK[b] ? a : b);

/** De opgetelde toegang van een set rollen. */
export interface CombinedAccess {
  isAdmin: boolean;
  hubLevel: SectionLevel;
  ticketingLevel: SectionLevel;
  commercial: boolean;
  commercialPermissions: Permission[];
}

export function combine(roles: readonly RoleGrant[]): CombinedAccess {
  let hubLevel: SectionLevel = "NONE";
  let ticketingLevel: SectionLevel = "NONE";
  const perms = new Set<Permission>();
  let commercial = false;
  for (const r of roles) {
    hubLevel = higher(hubLevel, r.hubLevel);
    ticketingLevel = higher(ticketingLevel, r.ticketingLevel);
    if (r.commercial) {
      commercial = true;
      for (const p of r.commercial) if (isPermission(p)) perms.add(p);
    }
  }
  return { isAdmin: roles.some((r) => r.isAdmin), hubLevel, ticketingLevel, commercial, commercialPermissions: [...perms].sort() };
}

/** De rolwaarden voor het inlogtoken en de routebewaking (`User.roles`). Zonder toegang: ["USER"] (nooit leeg, want leeg = "nog niet gemigreerd"). */
export function toAppRoles(a: Pick<CombinedAccess, "isAdmin" | "hubLevel" | "ticketingLevel">): AppRole[] | ["USER"] {
  const out: AppRole[] = [];
  if (a.isAdmin) out.push("ADMIN");
  if (a.hubLevel !== "NONE") out.push("HUB");
  if (a.hubLevel === "ADMIN") out.push("HUB_ADMIN");
  if (a.ticketingLevel !== "NONE") out.push("TICKETING");
  if (a.ticketingLevel === "ADMIN") out.push("TICKETING_ADMIN");
  return out.length > 0 ? out : ["USER"];
}

/** Omgekeerd: wat staat er in een (oude) rollenset? Zonder impliciete regels, letterlijk. */
export function fromAppRoles(roles: readonly string[]): Pick<CombinedAccess, "isAdmin" | "hubLevel" | "ticketingLevel"> {
  const has = (r: string) => roles.includes(r);
  return {
    isAdmin: has("ADMIN"),
    hubLevel: has("HUB_ADMIN") ? "ADMIN" : has("HUB") ? "USER" : "NONE",
    ticketingLevel: has("TICKETING_ADMIN") ? "ADMIN" : has("TICKETING") ? "USER" : "NONE",
  };
}

/** Korte, leesbare samenvatting van een rol, per onderdeel. */
export function describeRole(r: RoleGrant): string[] {
  if (r.isAdmin) return ["Alles: alle onderdelen, gebruikers en rollen"];
  const parts: string[] = [];
  if (r.hubLevel !== "NONE") parts.push(`Communicatie: ${LEVEL_LABELS[r.hubLevel].toLowerCase()}`);
  if (r.ticketingLevel !== "NONE") parts.push(`Ticketing: ${LEVEL_LABELS[r.ticketingLevel].toLowerCase()}`);
  if (r.commercial) {
    const n = r.commercial.filter(isPermission).length;
    parts.push(`Commerciële Zaken: ${n === 0 ? "toegang, nog geen bevoegdheden" : n === 1 ? "1 bevoegdheid" : `${n} bevoegdheden`}`);
  }
  return parts.length > 0 ? parts : ["Geeft (nog) nergens toegang toe"];
}

// --- Wie mag welke rol toewijzen of aanpassen ---------------------------------

/** Wat de ingelogde beheerder zelf mag beheren. */
export interface ManagerScope {
  userId: string;
  /** Hoofdadmin: alles. */
  full: boolean;
  hubAdmin: boolean;
  ticketingAdmin: boolean;
  /** Rechtenbeheer binnen Commerciële Zaken. */
  commercialManage: boolean;
  /** De bevoegdheden binnen Commerciële Zaken die deze beheerder zelf heeft (en dus kan doorgeven). */
  commercialGrantable: ReadonlySet<string>;
}

export type Decision = { ok: true } | { ok: false; message: string };
const ok: Decision = { ok: true };
const no = (message: string): Decision => ({ ok: false, message });

/**
 * Valt deze rol helemaal binnen wat de beheerder zelf beheert? Een beheerder van
 * een onderdeel geeft alleen gebruikerstoegang tot dat onderdeel; beheerders
 * aanwijzen en de Hoofdadmin-rol zijn voor de hoofdadmin. In Commerciële Zaken
 * kun je alleen bevoegdheden doorgeven die je zelf hebt.
 */
export function roleWithinScope(m: ManagerScope, r: RoleGrant): Decision {
  if (m.full) return ok;
  if (r.isAdmin) return no("Alleen een hoofdadmin kan de rol Hoofdadmin toewijzen of aanpassen.");
  if (r.hubLevel === "ADMIN" || r.ticketingLevel === "ADMIN") return no("Beheerders van een onderdeel wijst de hoofdadmin aan.");
  if (r.hubLevel === "USER" && !m.hubAdmin) return no("Deze rol geeft toegang tot Communicatie; dat beheer je niet.");
  if (r.ticketingLevel === "USER" && !m.ticketingAdmin) return no("Deze rol geeft toegang tot Ticketing; dat beheer je niet.");
  if (r.commercial) {
    if (!m.commercialManage) return no("Deze rol geeft toegang tot Commerciële Zaken; dat beheer je niet.");
    const beyond = r.commercial.filter((p) => !m.commercialGrantable.has(p));
    if (beyond.length > 0) return no("Deze rol bevat bevoegdheden in Commerciële Zaken die je zelf niet hebt.");
  }
  return ok;
}

/** Rollen van een gebruiker wijzigen: elke toegevoegde of weggehaalde rol moet binnen je bereik vallen. */
export function checkAssignment(
  m: ManagerScope,
  target: { userId: string; isAdmin: boolean },
  changed: readonly RoleGrant[],
): Decision {
  if (m.full) return ok;
  if (target.userId === m.userId) return no("Je kunt je eigen rollen niet wijzigen. Vraag een andere beheerder.");
  if (target.isAdmin) return no("Hoofdadmins hebben altijd toegang; dat regelt een hoofdadmin.");
  for (const r of changed) {
    const d = roleWithinScope(m, r);
    if (!d.ok) return d;
  }
  return ok;
}

/** Een rol aanmaken, wijzigen of verwijderen: zowel de oude als de nieuwe inhoud moeten binnen je bereik vallen. */
export function checkRoleEdit(m: ManagerScope, before: RoleGrant | null, after: RoleGrant | null, opts: { holdsRole?: boolean; isSystem?: boolean } = {}): Decision {
  if (opts.isSystem && after === null) return no("De rol Hoofdadmin kan niet worden verwijderd.");
  if (opts.isSystem && after && !after.isAdmin) return no("De rol Hoofdadmin blijft altijd volledige toegang geven.");
  if (m.full) return ok;
  if (opts.holdsRole) return no("Je hebt deze rol zelf; laat een andere beheerder hem aanpassen.");
  for (const r of [before, after]) {
    if (!r) continue;
    const d = roleWithinScope(m, r);
    if (!d.ok) return d;
  }
  return ok;
}

/** Vergelijkt twee toegangssituaties zoals de oude velden die vastleggen. */
export interface LegacySnapshot {
  isAdmin: boolean;
  hubLevel: SectionLevel;
  ticketingLevel: SectionLevel;
  commercialMember: boolean;
  commercialRoleId: string | null;
}

export function sameSnapshot(a: LegacySnapshot, b: LegacySnapshot): boolean {
  return (
    a.isAdmin === b.isAdmin &&
    a.hubLevel === b.hubLevel &&
    a.ticketingLevel === b.ticketingLevel &&
    a.commercialMember === b.commercialMember &&
    (!a.commercialMember || a.commercialRoleId === b.commercialRoleId)
  );
}

/** De oude CZ-rol die bij een set rollen hoort: alleen eenduidig bij precies één CZ-rol. */
export function legacyCommercialRoleId(roles: readonly { commercialRoleId: string | null }[]): string | null {
  const linked = roles.filter((r) => r.commercialRoleId);
  return linked.length === 1 ? linked[0].commercialRoleId : null;
}
