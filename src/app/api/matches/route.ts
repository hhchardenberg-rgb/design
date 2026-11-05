import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, apiErrorResponse } from "@/lib/api-guards";

/** Aankomende wedstrijden voor het dashboard (zie MASTERPROMPT sectie 16). */
export async function GET() {
  try {
    await requireRole("HUB");
    const matches = await prisma.match.findMany({
      where: { date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      orderBy: { date: "asc" },
      include: { team: true, opponent: true },
      take: 8,
    });
    return NextResponse.json({ matches });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
