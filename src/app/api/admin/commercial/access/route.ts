import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, apiErrorResponse, requireUser } from "@/lib/api-guards";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { ensureSystemRoles, loadCommercialAccess } from "@/lib/commercial/authz.server";
import { effectiveRoles } from "@/lib/roles";
import { buildActor, grantMembership, revokeMembership } from "@/lib/commercial/service.server";

// Platformbeheer: wie heeft toegang tot de sectie Commerciële Zaken. Dit geeft
// op zichzelf geen inzage in commerciële gegevens; de rechten binnen de sectie
// worden daarna door een lid met rechtenbeheer ingesteld.

export const dynamic = "force-dynamic";

function ensureEnabled() {
  if (!isCommercialEnabled()) throw new ApiError(404, "Niet gevonden.");
}

/** Hoofdadmin, of een beheerder van Commerciële Zaken met rechtenbeheer. */
async function requireAccessManager() {
  const user = await requireUser();
  if (!(await loadCommercialAccess(user.id)).can("rights:manage_rights")) throw new ApiError(403, "Alleen voor beheerders van Commerciële Zaken.");
  return user;
}

export async function GET() {
  try {
    ensureEnabled();
    await requireAccessManager();
    await ensureSystemRoles();
    const [users, memberships, roles] = await Promise.all([
      prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, role: true, roles: true } }),
      prisma.commercialMembership.findMany({ select: { userId: true, roleId: true } }),
      prisma.commercialRole.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }], select: { id: true, key: true, name: true } }),
    ]);
    const byUser = new Map(memberships.map((m) => [m.userId, m]));
    return NextResponse.json({
      roles,
      users: users.map(({ id, name, email, role, roles }) => ({ id, name, email, isAdmin: effectiveRoles({ role, roles }).includes("ADMIN"), hasAccess: byUser.has(id), roleId: byUser.get(id)?.roleId ?? null })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const grantSchema = z.object({ userId: z.string().min(1), roleId: z.string().nullable().optional() });

export async function POST(req: Request) {
  try {
    ensureEnabled();
    const admin = await requireAccessManager();
    const body = grantSchema.parse(await req.json());
    await grantMembership(await buildActor(admin), body.userId, body.roleId ?? null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(req: Request) {
  try {
    ensureEnabled();
    const admin = await requireAccessManager();
    const userId = new URL(req.url).searchParams.get("userId");
    if (!userId) throw new ApiError(400, "userId ontbreekt.");
    await revokeMembership(await buildActor(admin), userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
