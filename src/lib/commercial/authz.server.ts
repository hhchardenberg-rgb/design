import { prisma } from "@/lib/prisma";
import { ApiError, requireUser } from "@/lib/api-guards";
import { allowedSet, evaluate, type EffectivePermission } from "./evaluate";
import { isCommercialEnabled } from "./flag";
import { isPermission, type Permission } from "./permissions";
import { ROLE_TEMPLATES } from "./role-templates";

// Server-side autorisatie voor Commerciële Zaken. Bewust NIET gebaseerd op
// `hasRole()` of `User.roles`: ADMIN heeft hier geen toegang zonder expliciet
// lidmaatschap. Rechten worden bij elk verzoek uit de database berekend,
// niet uit het JWT, zodat intrekken direct effect heeft.

export interface CommercialAccess {
  userId: string;
  isMember: boolean;
  effective: Map<Permission, EffectivePermission>;
  allowed: ReadonlySet<Permission>;
  can: (p: Permission) => boolean;
}

export async function loadCommercialAccess(userId: string): Promise<CommercialAccess> {
  const membership = await prisma.commercialMembership.findUnique({
    where: { userId },
    include: { role: true, overrides: true },
  });

  const effective = evaluate({
    hasSectionAccess: !!membership,
    rolePermissions: (membership?.role?.permissions ?? []).filter(isPermission),
    overrides: (membership?.overrides ?? [])
      .filter((o) => isPermission(o.permission))
      .map((o) => ({ permission: o.permission as Permission, effect: o.effect })),
  });
  const allowed = allowedSet(effective);
  return { userId, isMember: !!membership, effective, allowed, can: (p) => allowed.has(p) };
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
