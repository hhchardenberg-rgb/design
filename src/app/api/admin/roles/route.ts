import { audit, ipOf } from "@/lib/audit";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireUserManager } from "@/lib/user-managers.server";
import { createAccessRole, listRoles } from "@/lib/access/service.server";
import { roleSchema } from "@/lib/access/schema";
import { isCommercialEnabled } from "@/lib/commercial/flag";

export const dynamic = "force-dynamic";

/** Alle rollen, plus de laatste wijzigingen aan rollen en toewijzingen. */
export async function GET() {
  try {
    const manager = await requireUserManager();
    const [roles, allEvents] = await Promise.all([
      listRoles(manager.scope),
      prisma.commercialAuditEvent.findMany({ where: { entity: { in: ["membership", "role"] } }, orderBy: { createdAt: "desc" }, take: 40 }),
    ]);
    // Commerciële Zaken uit: geen CZ-eigen logregels en niets over de verborgen CZ-rollen.
    const czOn = isCommercialEnabled();
    const listed = new Set(roles.map((r) => r.id));
    const hidden = czOn ? new Set<string>() : new Set((await prisma.accessRole.findMany({ select: { id: true } })).map((r) => r.id).filter((id) => !listed.has(id)));
    const events = czOn ? allEvents : allEvents.filter((e) => e.action.startsWith("access.") && !(e.entityId && hidden.has(e.entityId)));
    const names = new Map((await prisma.user.findMany({ where: { id: { in: events.map((e) => e.targetUserId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    const { scope } = manager;
    return NextResponse.json({
      manager: { full: scope.full, hubAdmin: scope.hubAdmin, ticketingAdmin: scope.ticketingAdmin, commercialManage: scope.commercialManage, userId: scope.userId },
      // Bevoegdheden in Commerciële Zaken die deze beheerder kan doorgeven (null = alles).
      grantable: scope.full ? null : [...scope.commercialGrantable],
      // Commerciële Zaken uit: het scherm toont geen CZ-onderdeel.
      commercialEnabled: czOn,
      roles,
      audit: events.map((e) => ({ id: e.id, at: e.createdAt.toISOString(), actor: e.actorLabel, action: e.action, target: e.targetUserId ? names.get(e.targetUserId) ?? null : null, before: e.before, after: e.after })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const manager = await requireUserManager();
    const input = roleSchema.parse(await req.json());
    const role = await createAccessRole(manager.actor, input);
    await audit({ action: "role.changed", actor: manager.user, target: { type: "role", id: role.id, name: input.name }, summary: `Rol aangemaakt: ${input.name}`, ip: ipOf(req) });
    return NextResponse.json({ role: { id: role.id } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
