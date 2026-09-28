import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { normalizeEmail } from "@/lib/utils";
import { effectiveRoles, hasRole, type AppRole } from "@/lib/roles";

const APP_ROLES = ["ADMIN", "HUB", "TICKETING"] as const;

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email("Ongeldig e-mailadres.").optional(),
  roles: z.array(z.enum(APP_ROLES)).optional(),
  password: z.string().min(8).optional(),
});

function isEffectivelyAdmin(user: { role: string; roles: string[] }): boolean {
  return hasRole(effectiveRoles(user), "ADMIN");
}

async function countEffectiveAdmins(): Promise<number> {
  return prisma.user.count({
    where: {
      OR: [{ roles: { has: "ADMIN" } }, { AND: [{ roles: { equals: [] } }, { role: "ADMIN" }] }],
    },
  });
}

/**
 * `nextRoles` is de rollenset die deze gebruiker NA de actie zou hebben:
 * `undefined` betekent "rollen blijven ongewijzigd door deze actie" (bv.
 * alleen naam/e-mail wijzigen), `[]` betekent "gebruiker wordt verwijderd /
 * verliest alle rollen". Alleen wanneer de actie een huidige beheerder zijn
 * ADMIN-rol zou laten verliezen, en dit de laatste beheerder zou zijn, wordt
 * de actie geweigerd.
 */
async function assertNotLastAdmin(userId: string, action: string, nextRoles: AppRole[] | undefined) {
  if (nextRoles === undefined) return;
  if (nextRoles.includes("ADMIN")) return;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || !isEffectivelyAdmin(target)) return;

  const adminCount = await countEffectiveAdmins();
  if (adminCount <= 1) {
    throw new ApiError(400, `Kan de laatste beheerder niet ${action} — maak eerst een andere beheerder aan.`);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = updateUserSchema.parse(await req.json());

    await assertNotLastAdmin(id, "degraderen naar gebruiker", body.roles);

    const email = body.email ? normalizeEmail(body.email) : undefined;
    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== id) {
        throw new ApiError(409, "Er bestaat al een account met dit e-mailadres.");
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        email,
        roles: body.roles,
        // Legacy-veld blijft meelopen zodat de historische kolom betekenisvol blijft.
        role: body.roles ? (body.roles.includes("ADMIN") ? "ADMIN" : "USER") : undefined,
        passwordHash: body.password ? await bcrypt.hash(body.password, 10) : undefined,
      },
      select: { id: true, name: true, email: true, roles: true, createdAt: true },
    });

    return NextResponse.json({ user });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    if (id === admin.id) {
      throw new ApiError(400, "Je kunt je eigen account niet verwijderen.");
    }
    await assertNotLastAdmin(id, "verwijderen", []);

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
