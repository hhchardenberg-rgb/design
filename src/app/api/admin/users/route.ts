import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { requireUserManager, visibleRoles } from "@/lib/user-managers.server";
import { normalizeEmail } from "@/lib/utils";
import { backfillUserRoles } from "@/lib/user-roles.server";
import { sendWelcome, unusablePasswordHash } from "@/lib/welcome.server";

const APP_ROLES = ["ADMIN", "HUB", "TICKETING", "HUB_ADMIN", "TICKETING_ADMIN"] as const;

const createUserSchema = z.object({
  name: z.string().min(1, "Naam is verplicht."),
  email: z.email("Ongeldig e-mailadres."),
  // Leeg is toegestaan als er een welkomstmail gaat: de gebruiker kiest dan zelf een wachtwoord via de instellink.
  password: z.union([z.literal(""), z.string().min(8, "Wachtwoord moet minimaal 8 tekens zijn.")]).optional(),
  roles: z.array(z.enum(APP_ROLES)).default(["HUB"]),
  sendWelcome: z.boolean().default(true),
}).refine((b) => b.sendWelcome || b.password, { message: "Vul een wachtwoord in, of stuur een welkomstmail zodat de gebruiker zelf een wachtwoord kiest.", path: ["password"] });

export async function GET() {
  try {
    const manager = await requireUserManager();
    // Zorgt dat gebruikers die nog op het legacy `role`-veld draaien (roles
    // is dan leeg) hier automatisch gemigreerd worden, zodat het scherm
    // altijd een correcte, expliciete rollenset laat zien.
    await backfillUserRoles(prisma);
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, roles: true, createdAt: true },
    });
    // Een beheerder van een onderdeel ziet alleen wie er is en welke rollen binnen zijn eigen onderdeel gelden.
    const shown = visibleRoles(manager);
    return NextResponse.json({
      manager: { full: manager.full, sections: manager.sections, commercial: manager.commercial },
      users: manager.full ? users : users.map((u) => ({ ...u, roles: u.roles.filter((r) => (shown as string[]).includes(r)) })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = createUserSchema.parse(await req.json());
    const email = normalizeEmail(body.email);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ApiError(409, "Er bestaat al een account met dit e-mailadres.");

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email,
        passwordHash: body.password ? await bcrypt.hash(body.password, 12) : await unusablePasswordHash(),
        roles: body.roles,
        // Legacy-veld blijft meelopen zodat de historische kolom betekenisvol blijft.
        role: body.roles.includes("ADMIN") ? "ADMIN" : "USER",
      },
      select: { id: true, name: true, email: true, roles: true, createdAt: true },
    });

    const welcome = body.sendWelcome ? await sendWelcome(prisma, user) : null;
    return NextResponse.json({ user, welcome });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
