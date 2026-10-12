import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, apiErrorResponse, requireAdmin } from "@/lib/api-guards";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { ensureSystemRoles } from "@/lib/commercial/authz.server";
import { buildActor, grantMembership, revokeMembership } from "@/lib/commercial/service.server";

// Platformbeheer: wie heeft toegang tot de sectie Commerciële Zaken. Dit geeft
// op zichzelf geen inzage in commerciële gegevens; de rechten binnen de sectie
// worden daarna door een lid met rechtenbeheer ingesteld.

export const dynamic = "force-dynamic";

function ensureEnabled() {
  if (!isCommercialEnabled()) throw new ApiError(404, "Niet gevonden.");
}

export async function GET() {
  try {
    ensureEnabled();
    await requireAdmin();
    await ensureSystemRoles();
    const [users, memberships, roles] = await Promise.all([
      prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
      prisma.commercialMembership.findMany({ select: { userId: true, roleId: true } }),
      prisma.commercialRole.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }], select: { id: true, key: true, name: true } }),
    ]);
    const byUser = new Map(memberships.map((m) => [m.userId, m]));
    return NextResponse.json({
      roles,
      users: users.map((u) => ({ ...u, hasAccess: byUser.has(u.id), roleId: byUser.get(u.id)?.roleId ?? null })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const grantSchema = z.object({ userId: z.string().min(1), roleId: z.string().nullable().optional() });

export async function POST(req: Request) {
  try {
    ensureEnabled();
    const admin = await requireAdmin();
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
    const admin = await requireAdmin();
    const userId = new URL(req.url).searchParams.get("userId");
    if (!userId) throw new ApiError(400, "userId ontbreekt.");
    await revokeMembership(await buildActor(admin), userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
