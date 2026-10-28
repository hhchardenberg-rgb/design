import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireUserManager } from "@/lib/user-managers.server";
import { createAccessRole, listRoles } from "@/lib/access/service.server";
import { roleSchema } from "@/lib/access/schema";

export const dynamic = "force-dynamic";

/** Alle rollen, plus de laatste wijzigingen aan rollen en toewijzingen. */
export async function GET() {
  try {
    const manager = await requireUserManager();
    const [roles, events] = await Promise.all([
      listRoles(manager.scope),
      prisma.commercialAuditEvent.findMany({ where: { entity: { in: ["membership", "role"] } }, orderBy: { createdAt: "desc" }, take: 40 }),
    ]);
    const names = new Map((await prisma.user.findMany({ where: { id: { in: events.map((e) => e.targetUserId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    const { scope } = manager;
    return NextResponse.json({
      manager: { full: scope.full, hubAdmin: scope.hubAdmin, ticketingAdmin: scope.ticketingAdmin, commercialManage: scope.commercialManage, userId: scope.userId },
      // Bevoegdheden in Commerciële Zaken die deze beheerder kan doorgeven (null = alles).
      grantable: scope.full ? null : [...scope.commercialGrantable],
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
    const role = await createAccessRole(manager.actor, roleSchema.parse(await req.json()));
    return NextResponse.json({ role: { id: role.id } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
