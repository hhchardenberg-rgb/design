import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";

const createUserSchema = z.object({
  name: z.string().min(1, "Naam is verplicht."),
  email: z.email("Ongeldig e-mailadres."),
  password: z.string().min(8, "Wachtwoord moet minimaal 8 tekens zijn."),
  role: z.enum(["USER", "ADMIN"]).default("USER"),
});

export async function GET() {
  try {
    await requireAdmin();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    return NextResponse.json({ users });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = createUserSchema.parse(await req.json());

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new ApiError(409, "Er bestaat al een account met dit e-mailadres.");

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash: await bcrypt.hash(body.password, 10),
        role: body.role,
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    return NextResponse.json({ user });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
