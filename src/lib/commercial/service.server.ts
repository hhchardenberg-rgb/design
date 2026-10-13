import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { allowedSet, evaluate } from "./evaluate";
import { checkAssignRole, checkEditRole, checkGrant, checkMembershipChange, checkRestrict, type Actor, type Decision } from "./delegation";
import { ALL_PERMISSIONS, findInconsistencies, isPermission, type Permission } from "./permissions";
import { loadCommercialAccess, ensureSystemRoles } from "./authz.server";
import { summarize } from "./explain";
import { DEFAULT_SCOPE, SCOPED_AREAS, scopeWithinLimit, type Scope, type ScopedArea } from "./scope";
import { loadScopes } from "./ctx.server";
import { effectiveRoles } from "@/lib/roles";

// Alle schrijfacties op toegang en rechten lopen via dit bestand: eerst de
// delegatieregels, dan de wijziging én de auditregel in één transactie.

export interface ServiceActor extends Actor {
  label: string;
}

export async function buildActor(user: { id: string; name?: string | null; email?: string | null; roles: string[] }): Promise<ServiceActor> {
  const access = await loadCommercialAccess(user.id);
  // Alleen de expliciete ADMIN-rol (hoofdadmin) telt als platformbeheer en heeft alle bevoegdheden.
  const isPlatformAdmin = user.roles.includes("ADMIN");
  return {
    userId: user.id,
    label: user.name || user.email || user.id,
    isPlatformAdmin,
    effective: isPlatformAdmin ? new Set(ALL_PERMISSIONS) : access.allowed,
  };
}

function enforce(decision: Decision, status = 403): void {
  if (!decision.ok) throw new ApiError(status, decision.message);
}

type Tx = Prisma.TransactionClient;

async function audit(
  tx: Tx,
  actor: ServiceActor,
  e: { action: string; entity: string; entityId?: string; targetUserId?: string; before?: unknown; after?: unknown },
) {
  await tx.commercialAuditEvent.create({
    data: {
      actorId: actor.userId,
      actorLabel: actor.label,
      targetUserId: e.targetUserId ?? null,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId ?? null,
      before: e.before === undefined ? undefined : (e.before as Prisma.InputJsonValue),
      after: e.after === undefined ? undefined : (e.after as Prisma.InputJsonValue),
    },
  });
}

interface MembershipFull {
  userId: string;
  roleId: string | null;
  role: { permissions: string[] } | null;
  overrides: { permission: string; effect: "ALLOW" | "DENY" }[];
}

function effectiveOf(m: Pick<MembershipFull, "role" | "overrides">): Set<Permission> {
  return allowedSet(
    evaluate({
      hasSectionAccess: true,
      rolePermissions: (m.role?.permissions ?? []).filter(isPermission),
      overrides: m.overrides.filter((o) => isPermission(o.permission)).map((o) => ({ permission: o.permission as Permission, effect: o.effect })),
    }),
  );
}

/** Aantal leden dat 'rights:manage_rights' houdt na een hypothetische wijziging. */
async function countRightsManagers(
  tx: Tx,
  change: { removeUserId?: string; replaceMember?: MembershipFull; replaceRole?: { id: string; permissions: string[] } } = {},
): Promise<number> {
  const all = await tx.commercialMembership.findMany({ include: { role: true, overrides: true } });
  let count = 0;
  for (const m of all) {
    if (m.userId === change.removeUserId) continue;
    let candidate: MembershipFull = m;
    if (change.replaceMember && m.userId === change.replaceMember.userId) candidate = change.replaceMember;
    if (change.replaceRole && candidate.roleId === change.replaceRole.id) {
      candidate = { ...candidate, role: { permissions: change.replaceRole.permissions } };
    }
    const eff = effectiveOf(candidate);
    if (eff.has("rights:manage_rights")) count++;
  }
  // Hoofdadmins hebben altijd rechtenbeheer, dus er blijft nooit niemand over zolang er een is.
  return count + (await tx.user.count({ where: { roles: { has: "ADMIN" } } }));
}

function assertConsistent(perms: readonly Permission[]) {
  const issues = findInconsistencies(perms);
  if (issues.length > 0) throw new ApiError(400, issues.map((i) => i.message).join(" "));
}

function assertKnown(perms: readonly string[]): Permission[] {
  const unknown = perms.filter((p) => !isPermission(p));
  if (unknown.length > 0) throw new ApiError(400, `Onbekende bevoegdheid: ${unknown.join(", ")}.`);
  return perms as Permission[];
}

// --- Sectietoegang (alleen platformbeheerder) ---------------------------------

export async function grantMembership(actor: ServiceActor, userId: string, roleId: string | null) {
  enforce(checkMembershipChange(actor, "grant"));
  await ensureSystemRoles();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, roles: true } });
  if (!user) throw new ApiError(404, "Gebruiker niet gevonden.");
  if (effectiveRoles(user).includes("ADMIN")) throw new ApiError(409, "Een hoofdadmin heeft automatisch volledige toegang tot Commerciële Zaken.");
  const role = roleId ? await prisma.commercialRole.findUnique({ where: { id: roleId } }) : null;
  if (roleId && !role) throw new ApiError(404, "Rol niet gevonden.");
  // Een rol meegeven is een toekenning: binnen de eigen grens blijven.
  if (role) enforce(checkAssignRole(actor, userId, role.permissions.filter(isPermission)));
  return prisma.$transaction(async (tx) => {
    if (await tx.commercialMembership.findUnique({ where: { userId } })) {
      throw new ApiError(409, "Deze gebruiker heeft al toegang tot Commerciële Zaken.");
    }
    const m = await tx.commercialMembership.create({ data: { userId, roleId, createdById: actor.userId } });
    await audit(tx, actor, {
      action: "membership.grant",
      entity: "membership",
      entityId: m.id,
      targetUserId: userId,
      after: { roleId, selfGranted: userId === actor.userId },
    });
    return m;
  });
}

export async function revokeMembership(actor: ServiceActor, userId: string) {
  return prisma.$transaction(async (tx) => {
    const m = await tx.commercialMembership.findUnique({ where: { userId }, include: { role: true, overrides: true } });
    if (!m) throw new ApiError(404, "Deze gebruiker heeft geen toegang tot Commerciële Zaken.");
    const isManager = effectiveOf(m).has("rights:manage_rights");
    const othersManage = (await countRightsManagers(tx, { removeUserId: userId })) >= 1;
    enforce(checkMembershipChange(actor, "revoke", { targetIsLastRightsManager: isManager && !othersManage }), 409);
    await tx.commercialMembership.delete({ where: { userId } });
    await audit(tx, actor, {
      action: "membership.revoke",
      entity: "membership",
      entityId: m.id,
      targetUserId: userId,
      before: { roleId: m.roleId, overrides: m.overrides.map((o) => ({ permission: o.permission, effect: o.effect })) },
    });
  });
}

// --- Rol van een lid ----------------------------------------------------------

export async function setMemberRole(actor: ServiceActor, userId: string, roleId: string | null) {
  return prisma.$transaction(async (tx) => {
    const m = await tx.commercialMembership.findUnique({ where: { userId }, include: { role: true, overrides: true } });
    if (!m) throw new ApiError(404, "Deze gebruiker heeft geen toegang tot Commerciële Zaken.");
    const role = roleId ? await tx.commercialRole.findUnique({ where: { id: roleId } }) : null;
    if (roleId && !role) throw new ApiError(404, "Rol niet gevonden.");
    const rolePerms = assertKnown(role?.permissions ?? []);

    // Rol toewijzen = alle bevoegdheden van die rol toekennen (delegatiegrens).
    enforce(rolePerms.length ? checkAssignRole(actor, userId, rolePerms) : checkRestrict(actor, userId));

    const next: MembershipFull = { ...m, roleId, role: role ? { permissions: role.permissions } : null };
    if (effectiveOf(m).has("rights:manage_rights") && !effectiveOf(next).has("rights:manage_rights")) {
      if ((await countRightsManagers(tx, { removeUserId: userId })) < 1) {
        throw new ApiError(409, "Dit zou het laatste lid zonder rechtenbeheer achterlaten. Wijs eerst iemand anders aan.");
      }
    }
    await tx.commercialMembership.update({ where: { userId }, data: { roleId } });
    await audit(tx, actor, { action: "member.role", entity: "membership", entityId: m.id, targetUserId: userId, before: { roleId: m.roleId }, after: { roleId } });
  });
}

// --- Individuele uitzonderingen -----------------------------------------------

/**
 * Stelt de gewenste effectieve bevoegdheden van een lid in. Het verschil met
 * de rol wordt opgeslagen als uitzonderingen: extra = expliciet toestaan,
 * ontbrekend = expliciet blokkeren. Een bevoegdheid die al uit de rol komt
 * en gewenst is, krijgt géén uitzondering ('overnemen van de rol').
 */
export async function setMemberPermissions(actor: ServiceActor, userId: string, desiredRaw: string[]) {
  const desired = [...new Set(assertKnown(desiredRaw))];
  assertConsistent(desired);

  return prisma.$transaction(async (tx) => {
    const m = await tx.commercialMembership.findUnique({ where: { userId }, include: { role: true, overrides: true } });
    if (!m) throw new ApiError(404, "Deze gebruiker heeft geen toegang tot Commerciële Zaken.");

    const current = effectiveOf(m);
    const added = desired.filter((p) => !current.has(p));
    const removed = [...current].filter((p) => !desired.includes(p));
    if (added.length === 0 && removed.length === 0) return { changed: false };

    enforce(added.length ? checkGrant(actor, userId, added) : checkRestrict(actor, userId));

    const base = new Set((m.role?.permissions ?? []).filter(isPermission));
    const wanted = new Set(desired);
    const overrides: { permission: Permission; effect: "ALLOW" | "DENY" }[] = [];
    for (const p of wanted) if (!base.has(p)) overrides.push({ permission: p, effect: "ALLOW" });
    for (const p of base) if (!wanted.has(p)) overrides.push({ permission: p, effect: "DENY" });

    const next: MembershipFull = { ...m, overrides };
    if (current.has("rights:manage_rights") && !effectiveOf(next).has("rights:manage_rights")) {
      if ((await countRightsManagers(tx, { removeUserId: userId })) < 1) {
        throw new ApiError(409, "Dit zou het laatste lid zonder rechtenbeheer achterlaten. Wijs eerst iemand anders aan.");
      }
    }

    await tx.commercialPermissionOverride.deleteMany({ where: { membershipId: m.id } });
    if (overrides.length) {
      await tx.commercialPermissionOverride.createMany({ data: overrides.map((o) => ({ membershipId: m.id, permission: o.permission, effect: o.effect })) });
    }
    await audit(tx, actor, {
      action: "member.permissions",
      entity: "membership",
      entityId: m.id,
      targetUserId: userId,
      before: { overrides: m.overrides.map((o) => ({ permission: o.permission, effect: o.effect })), effective: [...current].sort() },
      after: { overrides, effective: [...effectiveOf(next)].sort() },
    });
    return { changed: true };
  });
}

// --- Recordbereik ---------------------------------------------------------------

/**
 * Stelt per onderdeel het recordbereik (eigen / team / alles) van een lid in.
 * Je kunt geen ruimer bereik uitdelen dan je zelf hebt en niet je eigen bereik wijzigen.
 */
export async function setMemberScopes(actor: ServiceActor, userId: string, scopes: Partial<Record<ScopedArea, Scope>>) {
  enforce(checkRestrict(actor, userId)); // rechtenbeheer + niet jezelf
  const actorScopes = await loadScopes(actor.userId);
  for (const area of SCOPED_AREAS) {
    const requested = scopes[area];
    if (requested && !scopeWithinLimit(requested, actorScopes[area])) {
      throw new ApiError(403, "Je kunt geen ruimer bereik toekennen dan je zelf hebt.");
    }
  }
  return prisma.$transaction(async (tx) => {
    const m = await tx.commercialMembership.findUnique({ where: { userId }, include: { scopes: true } });
    if (!m) throw new ApiError(404, "Deze gebruiker heeft geen toegang tot Commerciële Zaken.");
    const before = Object.fromEntries(SCOPED_AREAS.map((a) => [a, m.scopes.find((r) => r.area === a)?.scope ?? DEFAULT_SCOPE]));
    for (const area of SCOPED_AREAS) {
      const scope = scopes[area];
      if (!scope) continue;
      await tx.commercialMemberScope.upsert({
        where: { membershipId_area: { membershipId: m.id, area } },
        update: { scope },
        create: { membershipId: m.id, area, scope },
      });
    }
    const after = { ...before, ...scopes };
    await audit(tx, actor, { action: "member.scopes", entity: "membership", entityId: m.id, targetUserId: userId, before, after });
  });
}

// --- Rollen ---------------------------------------------------------------------

function slug(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "rol";
}

export async function createRole(actor: ServiceActor, input: { name: string; description?: string; permissions: string[] }) {
  const perms = [...new Set(assertKnown(input.permissions))];
  assertConsistent(perms);
  enforce(checkEditRole(actor, perms, false));
  return prisma.$transaction(async (tx) => {
    let key = slug(input.name);
    if (await tx.commercialRole.findUnique({ where: { key } })) key = `${key}-${Date.now().toString(36)}`;
    const role = await tx.commercialRole.create({ data: { key, name: input.name, description: input.description ?? null, permissions: perms } });
    await audit(tx, actor, { action: "role.create", entity: "role", entityId: role.id, after: { name: role.name, permissions: perms } });
    return role;
  });
}

export async function updateRole(actor: ServiceActor, roleId: string, input: { name?: string; description?: string | null; permissions?: string[] }) {
  const perms = input.permissions ? [...new Set(assertKnown(input.permissions))] : undefined;
  if (perms) assertConsistent(perms);

  return prisma.$transaction(async (tx) => {
    const role = await tx.commercialRole.findUnique({ where: { id: roleId } });
    if (!role) throw new ApiError(404, "Rol niet gevonden.");
    const own = await tx.commercialMembership.findUnique({ where: { userId: actor.userId } });
    const added = perms ? perms.filter((p) => !role.permissions.includes(p)) : [];
    enforce(checkEditRole(actor, added, own?.roleId === roleId && perms !== undefined));

    if (perms) {
      const remaining = await countRightsManagers(tx, { replaceRole: { id: roleId, permissions: perms } });
      if (remaining < 1) throw new ApiError(409, "Dit zou het laatste lid met rechtenbeheer zonder die bevoegdheid laten. Wijs eerst iemand anders aan.");
    }
    const updated = await tx.commercialRole.update({
      where: { id: roleId },
      data: { name: input.name, description: input.description, permissions: perms },
    });
    await audit(tx, actor, {
      action: "role.update",
      entity: "role",
      entityId: roleId,
      before: { name: role.name, description: role.description, permissions: role.permissions },
      after: { name: updated.name, description: updated.description, permissions: updated.permissions },
    });
    return updated;
  });
}

// --- Lezen voor het beheerscherm -------------------------------------------------

export async function getRightsOverview(actor: ServiceActor) {
  await ensureSystemRoles();
  const [memberships, roles, events] = await Promise.all([
    prisma.commercialMembership.findMany({
      include: { user: { select: { id: true, name: true, email: true } }, role: true, overrides: true, scopes: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.commercialRole.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }] }),
    // Alleen toegangs- en rechtenwijzigingen; dossiermutaties horen niet bij het rechtenscherm.
    prisma.commercialAuditEvent.findMany({ where: { entity: { in: ["membership", "role", "team"] } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  const members = memberships.map((m) => {
    const eff = evaluate({
      hasSectionAccess: true,
      rolePermissions: (m.role?.permissions ?? []).filter(isPermission),
      overrides: m.overrides.filter((o) => isPermission(o.permission)).map((o) => ({ permission: o.permission as Permission, effect: o.effect })),
    });
    return {
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      roleId: m.roleId,
      roleName: m.role?.name ?? null,
      scopes: Object.fromEntries(SCOPED_AREAS.map((a) => [a, (m.scopes.find((r) => r.area === a)?.scope ?? DEFAULT_SCOPE) as Scope])) as Record<ScopedArea, Scope>,
      effective: summarize(eff),
    };
  });

  return {
    members,
    roles: roles.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, permissions: r.permissions, isSystem: r.isSystem })),
    audit: events.map((e) => ({
      id: e.id,
      at: e.createdAt.toISOString(),
      actor: e.actorLabel,
      action: e.action,
      targetUserId: e.targetUserId,
      before: e.before,
      after: e.after,
    })),
    grantable: [...actor.effective],
    actorUserId: actor.userId,
  };
}
