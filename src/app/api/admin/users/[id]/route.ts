import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { requireUserManager } from "@/lib/user-managers.server";
import { normalizeEmail } from "@/lib/utils";
import { effectiveRoles } from "@/lib/roles";
import { setUserRoles } from "@/lib/access/service.server";
import { audit, ipOf } from "@/lib/audit";
import { assertStrongPassword } from "@/lib/password-policy.server";

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email("Ongeldig e-mailadres.").optional(),
  roleIds: z.array(z.string()).optional(),
  password: z.string().min(12, "Wachtwoord moet minimaal 12 tekens zijn.").optional(),
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
    if (body.password) await assertStrongPassword(body.password, { email });
    const before = await prisma.user.findUnique({ where: { id }, select: { name: true, email: true, roles: true } });
    if (!before) throw new ApiError(404, "Gebruiker niet gevonden.");
    if (accountChange) {
      await prisma.user.update({
        where: { id },
        data: {
          name: body.name,
          email,
          // Een door de beheerder gezet wachtwoord laat ook alle bestaande sessies vervallen.
          ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 12), sessionVersion: { increment: 1 } } : {}),
        },
      });
      const changed = [body.name !== undefined && "naam", email !== undefined && "e-mailadres", body.password !== undefined && "wachtwoord"].filter(Boolean).join(", ");
      await audit({ action: "user.updated", actor: manager.user, target: { type: "user", id, name: body.name ?? before.name }, summary: `Account gewijzigd: ${changed}`, ip: ipOf(req) });
    }
    if (body.roleIds) {
      await setUserRoles(manager.actor, id, body.roleIds);
      const after = await prisma.user.findUnique({ where: { id }, select: { roles: true } });
      await audit({
        action: "user.roles_changed",
        actor: manager.user,
        target: { type: "user", id, name: before.name },
        summary: `Rollen gewijzigd: ${before.roles.join(", ") || "geen"} → ${after?.roles.join(", ") || "geen"}`,
        ip: ipOf(req),
        meta: { roleIds: body.roleIds },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    if (id === admin.id) throw new ApiError(400, "Je kunt je eigen account niet verwijderen.");
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, roles: true, name: true, email: true } });
    if (!target) throw new ApiError(404, "Gebruiker niet gevonden.");
    if (effectiveRoles(target).includes("ADMIN")) {
      const others = await prisma.user.count({ where: { id: { not: id }, roles: { has: "ADMIN" } } });
      if (others < 1) throw new ApiError(400, "Kan de laatste hoofdadmin niet verwijderen. Maak eerst iemand anders hoofdadmin.");
    }

    await prisma.user.delete({ where: { id } });
    await audit({ action: "user.deleted", actor: admin, target: { type: "user", id, name: target.name }, summary: `Account verwijderd: ${target.name} (${target.email})`, ip: ipOf(req) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
