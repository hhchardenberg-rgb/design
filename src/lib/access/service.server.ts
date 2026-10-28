import { Prisma, type CommercialRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { effectiveRoles } from "@/lib/roles";
import { findInconsistencies, isPermission, type Permission } from "@/lib/commercial/permissions";
import { ROLE_TEMPLATES } from "@/lib/commercial/role-templates";
import {
  checkAssignment,
  checkRoleEdit,
  combine,
  fromAppRoles,
  legacyCommercialRoleId,
  sameSnapshot,
  toAppRoles,
  isSectionLevel,
  type Decision,
  type LegacySnapshot,
  type ManagerScope,
  type RoleGrant,
  type SectionLevel,
} from "./model";

// Eén rollensysteem voor de hele Hub. De toewijzingen in `user_access_roles` zijn
// de bron van waarheid; na elke wijziging worden de afgeleide velden bijgewerkt
// (`User.roles` voor inlogtoken en routebewaking, `CommercialMembership` voor
// Commerciële Zaken). Alle schrijfacties nemen dezelfde databasevergrendeling,
// zodat gelijktijdige wijzigingen elkaar niet half overschrijven.

type Tx = Prisma.TransactionClient;

const LOCK = "SELECT pg_advisory_xact_lock(hashtext('hub-access-roles'))";
const TX_OPTS = { timeout: 30_000, maxWait: 15_000 };

const ROLE_INCLUDE = { commercialRole: true } as const;
type RoleRow = Prisma.AccessRoleGetPayload<{ include: typeof ROLE_INCLUDE }>;

export function grantOf(r: { isAdmin: boolean; hubLevel: string; ticketingLevel: string; commercialRole: Pick<CommercialRole, "permissions"> | null }): RoleGrant {
  return {
    isAdmin: r.isAdmin,
    hubLevel: isSectionLevel(r.hubLevel) ? r.hubLevel : "NONE",
    ticketingLevel: isSectionLevel(r.ticketingLevel) ? r.ticketingLevel : "NONE",
    commercial: r.commercialRole ? r.commercialRole.permissions : null,
  };
}

function enforce(d: Decision, status = 403) {
  if (!d.ok) throw new ApiError(status, d.message);
}

export interface AccessActor {
  scope: ManagerScope;
  label: string;
}

async function audit(tx: Tx, actor: AccessActor | null, e: { action: string; entity: "role" | "membership"; entityId?: string; targetUserId?: string; before?: unknown; after?: unknown }) {
  await tx.commercialAuditEvent.create({
    data: {
      actorId: actor?.scope.userId ?? null,
      actorLabel: actor?.label ?? "Systeem",
      targetUserId: e.targetUserId ?? null,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId ?? null,
      before: e.before === undefined ? undefined : (e.before as Prisma.InputJsonValue),
      after: e.after === undefined ? undefined : (e.after as Prisma.InputJsonValue),
    },
  });
}

// --- Afgeleide velden bijwerken -------------------------------------------------

/** Zet `User.roles` en het CZ-lidmaatschap gelijk aan de toegewezen rollen. */
export async function syncUserAccess(tx: Tx, userId: string): Promise<void> {
  const rows = await tx.userAccessRole.findMany({ where: { userId }, include: { role: { include: ROLE_INCLUDE } } });
  const roles = rows.map((r) => r.role);
  const combined = combine(roles.map(grantOf));
  await tx.user.update({ where: { id: userId }, data: { roles: toAppRoles(combined) as never, role: combined.isAdmin ? "ADMIN" : "USER" } });
  const membership = await tx.commercialMembership.findUnique({ where: { userId } });
  if (combined.commercial) {
    const roleId = legacyCommercialRoleId(roles);
    if (!membership) await tx.commercialMembership.create({ data: { userId, roleId } });
    else if (membership.roleId !== roleId) await tx.commercialMembership.update({ where: { userId }, data: { roleId } });
  } else if (membership) {
    // Zonder rol met toegang tot Commerciële Zaken vervalt het lidmaatschap (met uitzonderingen en bereik), zoals voorheen bij intrekken.
    await tx.commercialMembership.delete({ where: { userId } });
  }
}

// --- Overzetten en gelijk houden -------------------------------------------------

const PRESETS: { name: string; description: string; isSystem?: boolean; isAdmin?: boolean; hubLevel?: SectionLevel; ticketingLevel?: SectionLevel }[] = [
  { name: "Hoofdadmin", description: "Ziet en beheert alles: alle onderdelen, gebruikers en rollen.", isSystem: true, isAdmin: true },
  { name: "Communicatie", description: "Toegang tot de communicatie-hub: designtool, agenda, nieuws, kennisbank en meer.", hubLevel: "USER" },
  { name: "Communicatiebeheerder", description: "Beheert de inhoud en de gebruikers van Communicatie.", hubLevel: "ADMIN" },
  { name: "Ticketing", description: "Toegang tot Ticketing met handleidingen en procedures.", ticketingLevel: "USER" },
  { name: "Ticketingbeheerder", description: "Beheert de inhoud en de gebruikers van Ticketing.", ticketingLevel: "ADMIN" },
];

async function freeName(tx: Tx, wanted: string): Promise<string> {
  let name = wanted.trim().slice(0, 80) || "Rol";
  for (let i = 2; await tx.accessRole.findUnique({ where: { name }, select: { id: true } }); i++) name = `${wanted} (${i})`;
  return name;
}

async function systemAdminRole(tx: Tx) {
  const found = await tx.accessRole.findFirst({ where: { isSystem: true, isAdmin: true } });
  if (found) return found;
  const p = PRESETS[0];
  return tx.accessRole.create({ data: { name: await freeName(tx, p.name), description: p.description, isSystem: true, isAdmin: true } });
}

/** Een rol die precies dit ene niveau geeft (en verder niets); maakt hem aan als hij niet bestaat. */
async function exactSectionRole(tx: Tx, section: "hub" | "ticketing", level: Exclude<SectionLevel, "NONE">) {
  const where = { isAdmin: false, commercialRoleId: null, hubLevel: section === "hub" ? level : "NONE", ticketingLevel: section === "ticketing" ? level : "NONE" };
  const found = await tx.accessRole.findFirst({ where, orderBy: { createdAt: "asc" } });
  if (found) return found;
  const preset = PRESETS.find((p) => (section === "hub" ? p.hubLevel : p.ticketingLevel) === level && !p.isAdmin)!;
  return tx.accessRole.create({ data: { ...where, name: await freeName(tx, preset.name), description: preset.description } });
}

/** De rol die bij een (oude) CZ-rol hoort; maakt hem aan als hij niet bestaat. */
async function roleForCommercialRole(tx: Tx, cr: Pick<CommercialRole, "id" | "name" | "description">) {
  const found = await tx.accessRole.findUnique({ where: { commercialRoleId: cr.id } });
  if (found) return found;
  return tx.accessRole.create({ data: { name: await freeName(tx, cr.name), description: cr.description, commercialRoleId: cr.id } });
}

/** CZ-toegang zonder bevoegdheden (voor leden die voorheen geen rol hadden). */
async function commercialBasisRole(tx: Tx) {
  const found = await tx.accessRole.findFirst({
    where: { isAdmin: false, hubLevel: "NONE", ticketingLevel: "NONE", commercialRole: { permissions: { isEmpty: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (found) return found;
  const cr = await tx.commercialRole.create({ data: { key: await freeKey(tx, "cz-basistoegang"), name: "Commerciële Zaken (basistoegang)", permissions: [] } });
  return tx.accessRole.create({
    data: { name: await freeName(tx, "Commerciële Zaken (basistoegang)"), description: "Toegang tot Commerciële Zaken zonder vaste bevoegdheden; per persoon aan te vullen.", commercialRoleId: cr.id },
  });
}

async function freeKey(tx: Tx, base: string): Promise<string> {
  let key = base;
  for (let i = 2; await tx.commercialRole.findUnique({ where: { key }, select: { id: true } }); i++) key = `${base}-${i}`;
  return key;
}

/** Wat de oude velden over deze gebruiker zeggen. */
function legacySnapshotOf(u: { role: string; roles: string[]; commercialMembership: { roleId: string | null } | null }): LegacySnapshot {
  return {
    ...fromAppRoles(effectiveRoles(u)),
    commercialMember: !!u.commercialMembership,
    commercialRoleId: u.commercialMembership?.roleId ?? null,
  };
}

/**
 * Zet de bestaande toegang over naar het rollensysteem en houdt het daarna gelijk.
 * Eerste keer: standaardrollen aanmaken (ook voor elke bestaande CZ-rol) en iedereen
 * de rollen geven die precies bij de huidige toegang passen. Daarna: alleen gebruikers
 * waarvan de oude velden buiten dit systeem om zijn gewijzigd, opnieuw afleiden. Zo
 * gaat er nooit toegang verloren, ook niet als de oude versie nog even naast deze draait.
 */
export async function reconcileAccess(): Promise<{ firstRun: boolean; rebuilt: number }> {
  // De CZ-standaardrollen moeten bestaan om ze als rol over te kunnen nemen (eigen transactie, idempotent).
  const firstRun = (await prisma.accessRole.count()) === 0;
  if (firstRun) {
    for (const t of ROLE_TEMPLATES) {
      await prisma.commercialRole.upsert({ where: { key: t.key }, update: {}, create: { key: t.key, name: t.name, description: t.description, permissions: t.permissions, isSystem: true } });
    }
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(LOCK);
    const isFirst = (await tx.accessRole.count()) === 0;
    await systemAdminRole(tx);
    if (isFirst) {
      for (const p of PRESETS.slice(1)) {
        if (p.hubLevel) await exactSectionRole(tx, "hub", p.hubLevel as "USER" | "ADMIN");
        if (p.ticketingLevel) await exactSectionRole(tx, "ticketing", p.ticketingLevel as "USER" | "ADMIN");
      }
      for (const cr of await tx.commercialRole.findMany({ orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }] })) await roleForCommercialRole(tx, cr);
    }

    const users = await tx.user.findMany({ select: USER_SELECT });
    let rebuilt = 0;
    for (const u of users) if (await reconcileUserRow(tx, u)) rebuilt++;
    if (isFirst || rebuilt > 0) {
      await audit(tx, null, { action: isFirst ? "access.migrated" : "access.reconciled", entity: "role", after: { users: rebuilt } });
    }
    return { firstRun: isFirst, rebuilt };
  }, TX_OPTS);
}

const USER_SELECT = {
  id: true,
  role: true,
  roles: true,
  commercialMembership: { select: { roleId: true } },
  accessRoles: { select: { role: { include: ROLE_INCLUDE } } },
} as const;
type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

/** Leidt de rollen van één gebruiker opnieuw af uit de oude velden als die niet (meer) overeenkomen. */
async function reconcileUserRow(tx: Tx, u: UserRow): Promise<boolean> {
  const actual = legacySnapshotOf(u);
  const assigned = u.accessRoles.map((a) => a.role);
  const c = combine(assigned.map(grantOf));
  const expected: LegacySnapshot = { isAdmin: c.isAdmin, hubLevel: c.hubLevel, ticketingLevel: c.ticketingLevel, commercialMember: c.commercial, commercialRoleId: legacyCommercialRoleId(assigned) };
  if (sameSnapshot(actual, expected)) return false;

  const ids: string[] = [];
  if (actual.isAdmin) ids.push((await systemAdminRole(tx)).id);
  if (actual.hubLevel !== "NONE") ids.push((await exactSectionRole(tx, "hub", actual.hubLevel)).id);
  if (actual.ticketingLevel !== "NONE") ids.push((await exactSectionRole(tx, "ticketing", actual.ticketingLevel)).id);
  if (actual.commercialMember) {
    const cr = actual.commercialRoleId ? await tx.commercialRole.findUnique({ where: { id: actual.commercialRoleId } }) : null;
    ids.push((cr ? await roleForCommercialRole(tx, cr) : await commercialBasisRole(tx)).id);
  }
  await tx.userAccessRole.deleteMany({ where: { userId: u.id } });
  if (ids.length) await tx.userAccessRole.createMany({ data: [...new Set(ids)].map((roleId) => ({ userId: u.id, roleId })) });
  await syncUserAccess(tx, u.id);
  return true;
}

/** Vóór elke wijziging aan iemands rollen: eerst gelijk trekken, zodat er nooit toegang wegvalt die alleen nog in de oude velden stond. */
export async function reconcileUser(tx: Tx, userId: string): Promise<void> {
  const u = await tx.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  if (u) await reconcileUserRow(tx, u);
}

let ready: Promise<void> | null = null;

/** Eén keer per serverinstantie: overzetten/gelijk houden voordat rollen gelezen worden. */
export function ensureAccessReady(): Promise<void> {
  if (!ready) {
    ready = reconcileAccess().then(
      () => undefined,
      (e) => {
        ready = null;
        throw e;
      },
    );
  }
  return ready;
}

/** Alleen voor tests: dwingt een nieuwe controle af. */
export function resetAccessReady() {
  ready = null;
}

// --- Lezen ------------------------------------------------------------------------

/** Basisbevoegdheden in Commerciële Zaken per gebruiker: de optelsom van hun rollen. */
export async function commercialBasePermissions(db: Tx | typeof prisma, userIds?: string[]): Promise<Map<string, Permission[]>> {
  const [rows, memberships] = await Promise.all([
    db.userAccessRole.findMany({
      where: { ...(userIds ? { userId: { in: userIds } } : {}), role: { commercialRoleId: { not: null } } },
      select: { userId: true, role: { select: { commercialRole: { select: { permissions: true } } } } },
    }),
    db.commercialMembership.findMany({ where: userIds ? { userId: { in: userIds } } : {}, select: { userId: true, role: { select: { permissions: true } } } }),
  ]);
  const out = new Map<string, Set<Permission>>();
  for (const r of rows) {
    const set = out.get(r.userId) ?? new Set<Permission>();
    for (const p of r.role.commercialRole?.permissions ?? []) if (isPermission(p)) set.add(p);
    out.set(r.userId, set);
  }
  // Vangnet: een lid zonder CZ-rol in dit systeem (bv. vlak na een wijziging in een oudere versie) houdt de rechten van de oude rol.
  for (const m of memberships) {
    if (out.has(m.userId)) continue;
    out.set(m.userId, new Set((m.role?.permissions ?? []).filter(isPermission)));
  }
  return new Map([...out].map(([k, v]) => [k, [...v]]));
}

export interface RoleView {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isAdmin: boolean;
  hubLevel: SectionLevel;
  ticketingLevel: SectionLevel;
  commercial: string[] | null;
  userCount: number;
  /** Mag de ingelogde beheerder deze rol toewijzen en aanpassen? */
  manageable: boolean;
  manageReason: string | null;
}

export async function listRoles(scope: ManagerScope): Promise<RoleView[]> {
  await ensureAccessReady();
  const roles = await prisma.accessRole.findMany({
    include: { ...ROLE_INCLUDE, _count: { select: { users: true } } },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  return roles.map((r) => {
    const g = grantOf(r);
    const d = checkRoleEdit(scope, g, g);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      isAdmin: r.isAdmin,
      hubLevel: g.hubLevel,
      ticketingLevel: g.ticketingLevel,
      commercial: g.commercial,
      userCount: r._count.users,
      manageable: d.ok,
      manageReason: d.ok ? null : d.message,
    };
  });
}

/** Rol-id's per gebruiker. */
export async function assignmentsByUser(): Promise<Map<string, string[]>> {
  await ensureAccessReady();
  const rows = await prisma.userAccessRole.findMany({ select: { userId: true, roleId: true } });
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.userId, [...(out.get(r.userId) ?? []), r.roleId]);
  return out;
}

export async function roleNamesOf(userId: string): Promise<string[]> {
  await ensureAccessReady();
  const rows = await prisma.userAccessRole.findMany({ where: { userId }, select: { role: { select: { name: true, isSystem: true } } } });
  return rows.map((r) => r.role).sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name, "nl")).map((r) => r.name);
}

// --- Toewijzen ---------------------------------------------------------------------

async function assertKeepsAnAdmin(tx: Tx, userId: string, nextIsAdmin: boolean) {
  if (nextIsAdmin) return;
  const others = await tx.user.count({ where: { id: { not: userId }, roles: { has: "ADMIN" } } });
  if (others < 1) throw new ApiError(400, "Er moet altijd minstens één hoofdadmin overblijven. Maak eerst iemand anders hoofdadmin.");
}

/** Zet de rollen van een gebruiker. Alleen rollen die binnen je eigen beheer vallen, kun je toevoegen of weghalen. */
export async function setUserRoles(actor: AccessActor, userId: string, roleIds: string[]) {
  await ensureAccessReady();
  const wanted = [...new Set(roleIds)];
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(LOCK);
    await reconcileUser(tx, userId);
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true, roles: true, accessRoles: { select: { role: { include: ROLE_INCLUDE } } } } });
    if (!user) throw new ApiError(404, "Gebruiker niet gevonden.");
    const current = user.accessRoles.map((a) => a.role);
    const roles = await tx.accessRole.findMany({ where: { id: { in: wanted } }, include: ROLE_INCLUDE });
    if (roles.length !== wanted.length) throw new ApiError(404, "Een van de gekozen rollen bestaat niet (meer). Ververs de pagina.");
    const currentIds = new Set(current.map((r) => r.id));
    const added = roles.filter((r) => !currentIds.has(r.id));
    const removed = current.filter((r) => !wanted.includes(r.id));
    if (added.length === 0 && removed.length === 0) return { changed: false };

    enforce(checkAssignment(actor.scope, { userId, isAdmin: effectiveRoles(user).includes("ADMIN") }, [...added, ...removed].map(grantOf)));
    if (current.some((r) => r.isAdmin) || effectiveRoles(user).includes("ADMIN")) await assertKeepsAnAdmin(tx, userId, roles.some((r) => r.isAdmin));

    await tx.userAccessRole.deleteMany({ where: { userId, roleId: { in: removed.map((r) => r.id) } } });
    if (added.length) await tx.userAccessRole.createMany({ data: added.map((r) => ({ userId, roleId: r.id })) });
    await syncUserAccess(tx, userId);
    await audit(tx, actor, {
      action: "access.user.roles",
      entity: "membership",
      targetUserId: userId,
      before: { roles: current.map((r) => r.name) },
      after: { roles: roles.map((r) => r.name), added: added.map((r) => r.name), removed: removed.map((r) => r.name) },
    });
    return { changed: true };
  }, TX_OPTS);
}

/** Voegt één rol toe of haalt hem weg, de rest blijft staan. */
export async function toggleUserRole(actor: AccessActor, userId: string, roleId: string, on: boolean) {
  const current = (await assignmentsByUser()).get(userId) ?? [];
  const next = on ? [...current, roleId] : current.filter((id) => id !== roleId);
  return setUserRoles(actor, userId, next);
}

// --- Rollen aanmaken, wijzigen en verwijderen -------------------------------------

export interface RoleInput {
  name: string;
  description?: string | null;
  hubLevel: SectionLevel;
  ticketingLevel: SectionLevel;
  /** null = geen toegang tot Commerciële Zaken. */
  commercial: string[] | null;
}

function cleanCommercial(perms: string[] | null): Permission[] | null {
  if (perms === null) return null;
  const unique = [...new Set(perms)];
  const unknown = unique.filter((p) => !isPermission(p));
  if (unknown.length) throw new ApiError(400, `Onbekende bevoegdheid: ${unknown.join(", ")}.`);
  const issues = findInconsistencies(unique as Permission[]);
  if (issues.length) throw new ApiError(400, issues.map((i) => i.message).join(" "));
  return (unique as Permission[]).sort();
}

function slug(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "rol";
}

function nameTaken(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

const holds = async (tx: Tx, userId: string, roleId: string) => !!(await tx.userAccessRole.findUnique({ where: { userId_roleId: { userId, roleId } } }));

export async function createAccessRole(actor: AccessActor, input: RoleInput) {
  await ensureAccessReady();
  const commercial = cleanCommercial(input.commercial);
  const next: RoleGrant = { isAdmin: false, hubLevel: input.hubLevel, ticketingLevel: input.ticketingLevel, commercial };
  enforce(checkRoleEdit(actor.scope, null, next));
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(LOCK);
      const name = input.name.trim();
      const cr = commercial ? await tx.commercialRole.create({ data: { key: await freeKey(tx, `rol-${slug(name)}`), name, description: input.description ?? null, permissions: commercial } }) : null;
      const role = await tx.accessRole.create({
        data: { name, description: input.description?.trim() || null, hubLevel: input.hubLevel, ticketingLevel: input.ticketingLevel, commercialRoleId: cr?.id ?? null },
      });
      await audit(tx, actor, { action: "access.role.create", entity: "role", entityId: role.id, after: { name, ...next } });
      return role;
    }, TX_OPTS);
  } catch (e) {
    if (nameTaken(e)) throw new ApiError(409, "Er bestaat al een rol met deze naam.");
    throw e;
  }
}

export async function updateAccessRole(actor: AccessActor, roleId: string, input: RoleInput) {
  await ensureAccessReady();
  const commercial = cleanCommercial(input.commercial);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(LOCK);
      const role = await tx.accessRole.findUnique({ where: { id: roleId }, include: ROLE_INCLUDE });
      if (!role) throw new ApiError(404, "Rol niet gevonden.");
      const before = grantOf(role);
      const after: RoleGrant = { isAdmin: role.isAdmin, hubLevel: role.isAdmin ? "NONE" : input.hubLevel, ticketingLevel: role.isAdmin ? "NONE" : input.ticketingLevel, commercial: role.isAdmin ? null : commercial };
      enforce(checkRoleEdit(actor.scope, before, after, { holdsRole: await holds(tx, actor.scope.userId, roleId), isSystem: role.isSystem }));

      const name = input.name.trim();
      let commercialRoleId = role.commercialRoleId;
      if (after.commercial && role.commercialRole) {
        await tx.commercialRole.update({ where: { id: role.commercialRole.id }, data: { name, permissions: after.commercial } });
      } else if (after.commercial) {
        commercialRoleId = (await tx.commercialRole.create({ data: { key: await freeKey(tx, `rol-${slug(name)}`), name, permissions: after.commercial } })).id;
      } else {
        commercialRoleId = null;
      }
      const updated = await tx.accessRole.update({
        where: { id: roleId },
        data: { name, description: input.description?.trim() || null, hubLevel: after.hubLevel, ticketingLevel: after.ticketingLevel, commercialRoleId },
      });
      const holders = await tx.userAccessRole.findMany({ where: { roleId }, select: { userId: true } });
      for (const h of holders) await syncUserAccess(tx, h.userId);
      if (role.commercialRole && !after.commercial) await dropCommercialRole(tx, role.commercialRole.id);
      await audit(tx, actor, { action: "access.role.update", entity: "role", entityId: roleId, before: { name: role.name, ...before }, after: { name, ...after } });
      return updated;
    }, TX_OPTS);
  } catch (e) {
    if (nameTaken(e)) throw new ApiError(409, "Er bestaat al een rol met deze naam.");
    throw e;
  }
}

/** Ruimt de bijbehorende CZ-bevoegdhedenset op zodra niemand er meer naar verwijst. */
async function dropCommercialRole(tx: Tx, id: string) {
  const inUse = await tx.commercialMembership.count({ where: { roleId: id } });
  if (inUse === 0) await tx.commercialRole.delete({ where: { id } });
}

export async function deleteAccessRole(actor: AccessActor, roleId: string) {
  await ensureAccessReady();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(LOCK);
    const role = await tx.accessRole.findUnique({ where: { id: roleId }, include: ROLE_INCLUDE });
    if (!role) throw new ApiError(404, "Rol niet gevonden.");
    enforce(checkRoleEdit(actor.scope, grantOf(role), null, { holdsRole: await holds(tx, actor.scope.userId, roleId), isSystem: role.isSystem }));
    const holders = (await tx.userAccessRole.findMany({ where: { roleId }, select: { userId: true } })).map((h) => h.userId);
    await tx.accessRole.delete({ where: { id: roleId } });
    for (const userId of holders) await syncUserAccess(tx, userId);
    if (role.commercialRole) await dropCommercialRole(tx, role.commercialRole.id);
    await audit(tx, actor, { action: "access.role.delete", entity: "role", entityId: roleId, before: { name: role.name, ...grantOf(role), users: holders.length } });
    return { removedFrom: holders.length };
  }, TX_OPTS);
}

// --- Koppelingen voor Commerciële Zaken --------------------------------------------

/** Rol in dit systeem die bij een CZ-bevoegdhedenset hoort (null = basistoegang). Voor de CZ-service. */
export async function accessRoleForCommercial(tx: Tx, commercialRoleId: string | null) {
  if (!commercialRoleId) return commercialBasisRole(tx);
  const cr = await tx.commercialRole.findUnique({ where: { id: commercialRoleId } });
  if (!cr) throw new ApiError(404, "Rol niet gevonden.");
  return roleForCommercialRole(tx, cr);
}

export { LOCK as ACCESS_LOCK_SQL, TX_OPTS as ACCESS_TX_OPTS };
export type { RoleRow };
