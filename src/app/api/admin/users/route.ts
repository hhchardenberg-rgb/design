import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { requireUserManager } from "@/lib/user-managers.server";
import { normalizeEmail } from "@/lib/utils";
import { backfillUserRoles } from "@/lib/user-roles.server";
import { assignmentsByUser, listRoles, reconcileAccess, setUserRoles } from "@/lib/access/service.server";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { sendWelcome, unusablePasswordHash } from "@/lib/welcome.server";

export const dynamic = "force-dynamic";

const createUserSchema = z
  .object({
    name: z.string().min(1, "Naam is verplicht."),
    email: z.email("Ongeldig e-mailadres."),
    // Leeg is toegestaan als er een welkomstmail gaat: de gebruiker kiest dan zelf een wachtwoord via de instellink.
    password: z.union([z.literal(""), z.string().min(8, "Wachtwoord moet minimaal 8 tekens zijn.")]).optional(),
    roleIds: z.array(z.string()).default([]),
    sendWelcome: z.boolean().default(true),
  })
  .refine((b) => b.sendWelcome || b.password, { message: "Vul een wachtwoord in, of stuur een welkomstmail zodat de gebruiker zelf een wachtwoord kiest.", path: ["password"] });

/** Gebruikers, rollen en wat de ingelogde beheerder ermee mag: alles voor het scherm Gebruikers en rechten. */
export async function GET() {
  try {
    const manager = await requireUserManager();
    // Gebruikers die nog op het oude enkelvoudige rolveld draaien eerst omzetten.
    await backfillUserRoles(prisma);
    // Toewijzingen gelijk trekken met wat er buiten dit scherm om is veranderd (goedkoop; een handvol gebruikers).
    await reconcileAccess();
    const [users, roles, assigned] = await Promise.all([
      prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, roles: true, createdAt: true } }),
      listRoles(manager.scope),
      assignmentsByUser(),
    ]);
    return NextResponse.json({
      manager: { full: manager.full, sections: manager.sections, commercial: manager.commercial, userId: manager.user.id },
      commercialEnabled: isCommercialEnabled(),
      roles,
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        isAdmin: u.roles.includes("ADMIN"),
        roleIds: assigned.get(u.id) ?? [],
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const manager = await requireUserManager();
    const body = createUserSchema.parse(await req.json());
    const email = normalizeEmail(body.email);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ApiError(409, "Er bestaat al een account met dit e-mailadres.");

    // Zonder rollen: ["USER"] = nergens toegang (een lege set zou als "nog niet omgezet" gelden).
    const user = await prisma.user.create({
      data: { name: body.name, email, passwordHash: body.password ? await bcrypt.hash(body.password, 12) : await unusablePasswordHash(), roles: ["USER"], role: "USER" },
      select: { id: true, name: true, email: true },
    });
    if (body.roleIds.length) await setUserRoles(manager.actor, user.id, body.roleIds);
    const welcome = body.sendWelcome ? await sendWelcome(prisma, user) : null;
    return NextResponse.json({ user, welcome });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
