import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { allowedSet, evaluate } from "./evaluate";
import { checkAssignRole, checkGrant, checkMembershipChange, checkRestrict, type Actor, type Decision } from "./delegation";
import { ALL_PERMISSIONS, findInconsistencies, isPermission, type Permission } from "./permissions";
import { loadCommercialAccess } from "./authz.server";
import { summarize } from "./explain";
import { DEFAULT_SCOPE, SCOPED_AREAS, scopeWithinLimit, type Scope, type ScopedArea } from "./scope";
import { loadScopes } from "./ctx.server";
import { effectiveRoles } from "@/lib/roles";
import { ACCESS_LOCK_SQL, ACCESS_TX_OPTS, accessRoleForCommercial, commercialBasePermissions, ensureAccessReady, reconcileUser, syncUserAccess } from "@/lib/access/service.server";

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
  /** Basisbevoegdheden: de optelsom van de rollen van deze persoon. */
  base: string[];
  overrides: { permission: string; effect: "ALLOW" | "DENY" }[];
}

function effectiveOf(m: Pick<MembershipFull, "base" | "overrides">): Set<Permission> {
  return allowedSet(
    evaluate({
      hasSectionAccess: true,
      rolePermissions: m.base.filter(isPermission),
      overrides: m.overrides.filter((o) => isPermission(o.permission)).map((o) => ({ permission: o.permission as Permission, effect: o.effect })),
    }),
  );
}

/** Aantal leden dat 'rights:manage_rights' houdt na een hypothetische wijziging. */
async function countRightsManagers(tx: Tx, change: { removeUserId?: string; replaceMember?: MembershipFull } = {}): Promise<number> {
  const [all, base] = await Promise.all([tx.commercialMembership.findMany({ include: { overrides: true } }), commercialBasePermissions(tx)]);
  let count = 0;
  for (const m of all) {
    if (m.userId === change.removeUserId) continue;
    let candidate: MembershipFull = { userId: m.userId, base: base.get(m.userId) ?? [], overrides: m.overrides };
    if (change.replaceMember && m.userId === change.replaceMember.userId) candidate = change.replaceMember;
    if (effectiveOf(candidate).has("rights:manage_rights")) count++;
  }
  // Hoofdadmins hebben altijd rechtenbeheer, dus er blijft nooit niemand over zolang er een is.
  return count + (await tx.user.count({ where: { roles: { has: "ADMIN" } } }));
}

async function loadMember(tx: Tx, userId: string): Promise<(MembershipFull & { id: string; overrides: { permission: string; effect: "ALLOW" | "DENY" }[] }) | null> {
  const m = await tx.commercialMembership.findUnique({ where: { userId }, include: { overrides: true } });
  if (!m) return null;
  const base = (await commercialBasePermissions(tx, [userId])).get(userId) ?? [];
  return { id: m.id, userId, base, overrides: m.overrides };
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

// --- Sectietoegang ----------------------------------------------------------------
// Toegang tot Commerciële Zaken loopt via de rollen van de Hub (src/lib/access). Deze
// twee functies zijn de korte weg "toegang geven met deze CZ-rol" en "alle CZ-rollen
// weghalen"; de wijziging gaat via de rollentoewijzing, zodat alles gelijk blijft.

export async function grantMembership(actor: ServiceActor, userId: string, roleId: string | null) {
  enforce(checkMembershipChange(actor, "grant"));
  await ensureAccessReady();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, roles: true } });
  if (!user) throw new ApiError(404, "Gebruiker niet gevonden.");
  if (effectiveRoles(user).includes("ADMIN")) throw new ApiError(409, "Een hoofdadmin heeft automatisch volledige toegang tot Commerciële Zaken.");
  const role = roleId ? await prisma.commercialRole.findUnique({ where: { id: roleId } }) : null;
  if (roleId && !role) throw new ApiError(404, "Rol niet gevonden.");
  // Een rol meegeven is een toekenning: binnen de eigen grens blijven.
  if (role) enforce(checkAssignRole(actor, userId, role.permissions.filter(isPermission)));
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(ACCESS_LOCK_SQL);
    await reconcileUser(tx, userId);
    if (await tx.commercialMembership.findUnique({ where: { userId } })) {
      throw new ApiError(409, "Deze gebruiker heeft al toegang tot Commerciële Zaken.");
    }
    const accessRole = await accessRoleForCommercial(tx, roleId);
    await tx.userAccessRole.create({ data: { userId, roleId: accessRole.id } });
    await syncUserAccess(tx, userId);
    const m = await tx.commercialMembership.update({ where: { userId }, data: { createdById: actor.userId } });
    await audit(tx, actor, {
      action: "membership.grant",
      entity: "membership",
      entityId: m.id,
      targetUserId: userId,
      after: { roleId, role: accessRole.name, selfGranted: userId === actor.userId },
    });
    return m;
  }, ACCESS_TX_OPTS);
}

export async function revokeMembership(actor: ServiceActor, userId: string) {
  await ensureAccessReady();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(ACCESS_LOCK_SQL);
    await reconcileUser(tx, userId);
    const m = await loadMember(tx, userId);
    if (!m) throw new ApiError(404, "Deze gebruiker heeft geen toegang tot Commerciële Zaken.");
    const isManager = effectiveOf(m).has("rights:manage_rights");
    const othersManage = (await countRightsManagers(tx, { removeUserId: userId })) >= 1;
    enforce(checkMembershipChange(actor, "revoke", { targetIsLastRightsManager: isManager && !othersManage }), 409);
    const czRoles = await tx.userAccessRole.findMany({ where: { userId, role: { commercialRoleId: { not: null } } }, select: { roleId: true, role: { select: { name: true } } } });
    await tx.userAccessRole.deleteMany({ where: { userId, roleId: { in: czRoles.map((r) => r.roleId) } } });
    await syncUserAccess(tx, userId);
    // Een lid zonder CZ-rol in het rollensysteem (vangnet) verdwijnt hier ook.
    await tx.commercialMembership.deleteMany({ where: { userId } });
    await audit(tx, actor, {
      action: "membership.revoke",
      entity: "membership",
      entityId: m.id,
      targetUserId: userId,
      before: { roles: czRoles.map((r) => r.role.name), overrides: m.overrides.map((o) => ({ permission: o.permission, effect: o.effect })) },
    });
  }, ACCESS_TX_OPTS);
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
    const m = await loadMember(tx, userId);
    if (!m) throw new ApiError(404, "Deze gebruiker heeft geen toegang tot Commerciële Zaken.");

    const current = effectiveOf(m);
    const added = desired.filter((p) => !current.has(p));
    const removed = [...current].filter((p) => !desired.includes(p));
    if (added.length === 0 && removed.length === 0) return { changed: false };

    enforce(added.length ? checkGrant(actor, userId, added) : checkRestrict(actor, userId));

    const base = new Set(m.base.filter(isPermission));
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

// --- Lezen voor het beheerscherm -------------------------------------------------

export async function getRightsOverview(actor: ServiceActor) {
  await ensureAccessReady();
  const [memberships, base, czRoles, events] = await Promise.all([
    prisma.commercialMembership.findMany({
      include: { user: { select: { id: true, name: true, email: true, accessRoles: { where: { role: { commercialRoleId: { not: null } } }, select: { role: { select: { name: true } } } } } }, overrides: true, scopes: true },
      orderBy: { createdAt: "asc" },
    }),
    commercialBasePermissions(prisma),
    prisma.accessRole.findMany({ where: { commercialRoleId: { not: null } }, include: { commercialRole: true }, orderBy: { name: "asc" } }),
    // Alleen toegangs- en rechtenwijzigingen; dossiermutaties horen niet bij het rechtenscherm.
    prisma.commercialAuditEvent.findMany({ where: { entity: { in: ["membership", "role", "team"] } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  const members = memberships.map((m) => {
    const eff = evaluate({
      hasSectionAccess: true,
      rolePermissions: (base.get(m.userId) ?? []).filter(isPermission),
      overrides: m.overrides.filter((o) => isPermission(o.permission)).map((o) => ({ permission: o.permission as Permission, effect: o.effect })),
    });
    const roleNames = m.user.accessRoles.map((a) => a.role.name).sort((a, b) => a.localeCompare(b, "nl"));
    return {
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      roleNames,
      roleName: roleNames.length ? roleNames.join(", ") : null,
      scopes: Object.fromEntries(SCOPED_AREAS.map((a) => [a, (m.scopes.find((r) => r.area === a)?.scope ?? DEFAULT_SCOPE) as Scope])) as Record<ScopedArea, Scope>,
      effective: summarize(eff),
    };
  });

  return {
    members,
    roles: czRoles.map((r) => ({ id: r.id, name: r.name, description: r.description, permissions: r.commercialRole?.permissions ?? [] })),
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
