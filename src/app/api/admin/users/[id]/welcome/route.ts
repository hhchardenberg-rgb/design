import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { sendWelcome } from "@/lib/welcome.server";

/** Welkomstmail (opnieuw) sturen, bv. voor een account van vóór de welkomstmail of als de link verlopen is. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
    if (!user) throw new ApiError(404, "Gebruiker niet gevonden.");
    return NextResponse.json({ welcome: await sendWelcome(prisma, user) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
