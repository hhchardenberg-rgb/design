import { prisma } from "@/lib/prisma";
import { ApiError, requireUser } from "@/lib/api-guards";
import { allowedSet, evaluate, type EffectivePermission } from "./evaluate";
import { isCommercialEnabled } from "./flag";
import { ALL_PERMISSIONS, isPermission, type Permission } from "./permissions";
import { effectiveRoles } from "@/lib/roles";
import { ROLE_TEMPLATES } from "./role-templates";

// Server-side autorisatie voor Commerciële Zaken. Een hoofdadmin (rol ADMIN) heeft automatisch
// volledige toegang; voor ieder ander is een lidmaatschap met een rol nodig. Een beheerder
// van alleen een ander onderdeel (Communicatie, Ticketing) heeft hier geen toegang. Rechten
// worden bij elk verzoek uit de database berekend, niet uit het JWT, zodat intrekken direct
// effect heeft.

export interface CommercialAccess {
  userId: string;
  /** Hoofdadmin: automatisch volledige toegang, ongeacht lidmaatschap. */
  isPlatformAdmin: boolean;
  isMember: boolean;
  effective: Map<Permission, EffectivePermission>;
  allowed: ReadonlySet<Permission>;
  can: (p: Permission) => boolean;
}

export async function loadCommercialAccess(userId: string): Promise<CommercialAccess> {
  const [membership, user] = await Promise.all([
    prisma.commercialMembership.findUnique({ where: { userId }, include: { role: true, overrides: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true, roles: true } }),
  ]);
  const isPlatformAdmin = !!user && effectiveRoles(user).includes("ADMIN");
  if (isPlatformAdmin) {
    const effective = evaluate({ hasSectionAccess: true, rolePermissions: ALL_PERMISSIONS, overrides: [] });
    const allowed = allowedSet(effective);
    return { userId, isPlatformAdmin, isMember: true, effective, allowed, can: (p) => allowed.has(p) };
  }

  const effective = evaluate({
    hasSectionAccess: !!membership,
    rolePermissions: (membership?.role?.permissions ?? []).filter(isPermission),
    overrides: (membership?.overrides ?? [])
      .filter((o) => isPermission(o.permission))
      .map((o) => ({ permission: o.permission as Permission, effect: o.effect })),
  });
  const allowed = allowedSet(effective);
  return { userId, isPlatformAdmin: false, isMember: !!membership, effective, allowed, can: (p) => allowed.has(p) };
}

/**
 * Vereist dat de ingelogde gebruiker ALLE genoemde bevoegdheden heeft.
 * Flag uit → 404 (de sectie bestaat dan niet). Geen lid of geen recht → 403.
 * Objectgebonden controles (recordbereik, vertrouwelijkheid) volgen in de
 * fase waarin de betreffende gegevens bestaan en gebruiken dit als basis.
 */
export async function requireCommercial(...permissions: Permission[]) {
  if (!isCommercialEnabled()) throw new ApiError(404, "Niet gevonden.");
  const user = await requireUser();
  const access = await loadCommercialAccess(user.id);
  if (!access.isMember) throw new ApiError(403, "Je hebt geen toegang tot Commerciële Zaken.");
  const missing = permissions.filter((p) => !access.can(p));
  if (missing.length > 0) throw new ApiError(403, "Je hebt hiervoor geen bevoegdheid binnen Commerciële Zaken.");
  return { user, access };
}

/** Zet de standaard roltemplates één keer klaar; bestaande (mogelijk aangepaste) rollen blijven ongemoeid. */
export async function ensureSystemRoles(): Promise<void> {
  for (const t of ROLE_TEMPLATES) {
    await prisma.commercialRole.upsert({
      where: { key: t.key },
      update: {},
      create: { key: t.key, name: t.name, description: t.description, permissions: t.permissions, isSystem: true },
    });
  }
  await addLaterPermissions();
  await renameDefaultRoles();
}

/**
 * Standaardrollen die later een andere naam kregen. Alleen hernoemen als de naam nog de oude
 * standaardnaam is, zodat een naam die een beheerder zelf koos blijft staan. De sleutel blijft gelijk.
 */
const RENAMED_ROLES: { key: string; from: string; to: string }[] = [{ key: "sponsorcommissielid", from: "Sponsorcommissielid", to: "Commissielid" }];

async function renameDefaultRoles(): Promise<void> {
  for (const { key, from, to } of RENAMED_ROLES) {
    await prisma.commercialRole.updateMany({ where: { key, name: from }, data: { name: to } });
  }
}

/**
 * Bevoegdheden die na de eerste uitrol zijn bijgekomen, één keer toevoegen aan de bestaande
 * standaardrol. Een regel in het logboek markeert dat het gebeurd is, zodat een bewuste
 * verwijdering door een beheerder daarna blijft staan.
 */
const LATER_PERMISSIONS: { roleKey: string; permission: Permission }[] = [{ roleKey: "beheerder", permission: "history:delete" }];

async function addLaterPermissions(): Promise<void> {
  for (const { roleKey, permission } of LATER_PERMISSIONS) {
    const marker = `${roleKey}:${permission}`;
    if (await prisma.commercialAuditEvent.findFirst({ where: { action: "role.permission_added", entityId: marker }, select: { id: true } })) continue;
    const role = await prisma.commercialRole.findUnique({ where: { key: roleKey } });
    if (!role) continue;
    if (!role.permissions.includes(permission)) {
      await prisma.commercialRole.update({ where: { id: role.id }, data: { permissions: { push: permission } } });
    }
    await writeCommercialAudit({ actorId: null, actorLabel: "Systeem", action: "role.permission_added", entity: "role", entityId: marker, after: { role: role.name, permission } });
  }
}

export async function writeCommercialAudit(entry: {
  actorId: string | null;
  actorLabel?: string | null;
  targetUserId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await prisma.commercialAuditEvent.create({
    data: {
      actorId: entry.actorId,
      actorLabel: entry.actorLabel ?? null,
      targetUserId: entry.targetUserId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: entry.before === undefined ? undefined : (entry.before as object),
      after: entry.after === undefined ? undefined : (entry.after as object),
    },
  });
}
