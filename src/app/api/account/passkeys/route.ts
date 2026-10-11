import { NextResponse } from "next/server";
import { requireUser, apiErrorResponse } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";

/** Lijst van de eigen passkeys (voor de "Accountbeveiliging"-pagina). */
export async function GET() {
  try {
    const user = await requireUser();
    const passkeys = await prisma.webAuthnCredential.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, deviceType: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ passkeys });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
