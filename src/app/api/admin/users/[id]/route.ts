import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { requireUserManager } from "@/lib/user-managers.server";
import { normalizeEmail } from "@/lib/utils";
import { effectiveRoles } from "@/lib/roles";
import { setUserRoles } from "@/lib/access/service.server";

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email("Ongeldig e-mailadres.").optional(),
  roleIds: z.array(z.string()).optional(),
  password: z.string().min(8).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const manager = await requireUserManager();
    const { id } = await params;
    const body = updateUserSchema.parse(await req.json());

    // Accounts en wachtwoorden zijn voor de hoofdadmin; rollen toewijzen kan elke beheerder binnen zijn eigen bereik.
    const accountChange = body.name !== undefined || body.email !== undefined || body.password !== undefined;
    if (accountChange && !manager.full) throw new ApiError(403, "Accounts en wachtwoorden beheert een hoofdadmin.");

    const email = body.email ? normalizeEmail(body.email) : undefined;
    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== id) throw new ApiError(409, "Er bestaat al een account met dit e-mailadres.");
    }
    if (accountChange) {
      await prisma.user.update({
        where: { id },
        data: { name: body.name, email, passwordHash: body.password ? await bcrypt.hash(body.password, 12) : undefined },
      });
    }
    if (body.roleIds) await setUserRoles(manager.actor, id, body.roleIds);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    if (id === admin.id) throw new ApiError(400, "Je kunt je eigen account niet verwijderen.");
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, roles: true } });
    if (!target) throw new ApiError(404, "Gebruiker niet gevonden.");
    if (effectiveRoles(target).includes("ADMIN")) {
      const others = await prisma.user.count({ where: { id: { not: id }, roles: { has: "ADMIN" } } });
      if (others < 1) throw new ApiError(400, "Kan de laatste hoofdadmin niet verwijderen. Maak eerst iemand anders hoofdadmin.");
    }

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
