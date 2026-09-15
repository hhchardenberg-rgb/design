import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { normalizeEmail } from "@/lib/utils";

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email("Ongeldig e-mailadres.").optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  password: z.string().min(8).optional(),
});

async function assertNotLastAdmin(userId: string, action: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role !== "ADMIN") return;
  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  if (adminCount <= 1) {
    throw new ApiError(400, `Kan de laatste beheerder niet ${action} — maak eerst een andere beheerder aan.`);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = updateUserSchema.parse(await req.json());

    if (body.role === "USER") {
      await assertNotLastAdmin(id, "degraderen naar gebruiker");
    }

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
        role: body.role,
        passwordHash: body.password ? await bcrypt.hash(body.password, 10) : undefined,
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
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
    await assertNotLastAdmin(id, "verwijderen");

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
