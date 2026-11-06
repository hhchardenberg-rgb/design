import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse, requireAdmin } from "@/lib/api-guards";
import { AUDIT_ACTIONS } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PAGE = 50;
const GROUPS: Record<string, string[]> = {
  login: ["auth.login", "auth.login_failed", "auth.locked", "auth.new_device", "auth.logout_all"],
  beveiliging: ["auth.password_changed", "auth.password_reset", "auth.mfa_enabled", "auth.mfa_disabled", "auth.passkey_added", "auth.passkey_removed", "auth.recovery_codes"],
  accounts: ["user.created", "user.updated", "user.deleted", "user.roles_changed", "role.changed"],
  gegevens: ["backup.run", "backup.failed", "backup.download", "data.export", "file.download"],
};

/** Audit-log, nieuwste eerst. Filters: ?groep=login|beveiliging|accounts|gegevens, ?q=naam, ?cursor=<id>. Alleen hoofdadmin. */
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const p = new URL(req.url).searchParams;
    const where: Prisma.AuditEventWhereInput = {};
    const group = p.get("groep");
    if (group && GROUPS[group]) where.action = { in: GROUPS[group] };
    const q = p.get("q")?.trim();
    if (q) {
      where.OR = [
        { actorName: { contains: q, mode: "insensitive" } },
        { targetName: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { ip: { startsWith: q } },
      ];
    }
    const cursor = p.get("cursor");
    const rows = await prisma.auditEvent.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const more = rows.length > PAGE;
    const events = rows.slice(0, PAGE).map((e) => ({
      id: e.id,
      at: e.at,
      action: e.action,
      label: AUDIT_ACTIONS[e.action as keyof typeof AUDIT_ACTIONS] ?? e.action,
      actorName: e.actorName,
      targetName: e.targetName,
      summary: e.summary,
      ip: e.ip,
    }));
    return NextResponse.json({ events, next: more ? events[events.length - 1].id : null });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
