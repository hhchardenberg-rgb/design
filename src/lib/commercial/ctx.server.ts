import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { loadCommercialAccess } from "./authz.server";
import type { Permission } from "./permissions";
import { DEFAULT_SCOPE, isScope, type Scope, type ScopedArea, type Viewer } from "./scope";

/** Alles wat een service nodig heeft om rechten, bereik en teams van de ingelogde gebruiker af te dwingen. */
export interface RecordCtx {
  userId: string;
  label: string;
  viewer: Viewer;
  can: (p: Permission) => boolean;
  scope: (area: ScopedArea) => Scope;
}

export async function loadScopes(userId: string): Promise<Record<ScopedArea, Scope>> {
  const rows = await prisma.commercialMemberScope.findMany({ where: { membership: { userId } } });
  const pick = (area: ScopedArea): Scope => {
    const v = rows.find((r) => r.area === area)?.scope;
    return v && isScope(v) ? v : DEFAULT_SCOPE;
  };
  return { companies: pick("companies"), tasks: pick("tasks") };
}

export async function buildRecordCtx(user: { id: string; name?: string | null; email?: string | null }): Promise<RecordCtx> {
  const [access, scopes, teams] = await Promise.all([
    loadCommercialAccess(user.id),
    loadScopes(user.id),
    prisma.commercialTeamMember.findMany({ where: { userId: user.id }, select: { teamId: true } }),
  ]);
  if (!access.isMember) throw new ApiError(403, "Je hebt geen toegang tot Commerciële Zaken.");
  return {
    userId: user.id,
    label: user.name || user.email || user.id,
    viewer: { userId: user.id, teamIds: teams.map((t) => t.teamId) },
    can: access.can,
    scope: (area) => scopes[area],
  };
}

export function need(ctx: RecordCtx, permission: Permission): void {
  if (!ctx.can(permission)) throw new ApiError(403, "Je hebt hiervoor geen bevoegdheid binnen Commerciële Zaken.");
}

/** Eenvoudig, eenduidig 'niet gevonden' voor records buiten bereik: bevestigt het bestaan niet. */
export function notFound(what: string): never {
  throw new ApiError(404, `${what} niet gevonden.`);
}

export async function auditRecord(
  ctx: RecordCtx,
  e: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown },
) {
  // Alleen id's en veldwaarden die geen vertrouwelijke dossierinhoud zijn.
  await prisma.commercialAuditEvent.create({
    data: {
      actorId: ctx.userId,
      actorLabel: ctx.label,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      before: e.before === undefined ? undefined : (e.before as object),
      after: e.after === undefined ? undefined : (e.after as object),
    },
  });
}
