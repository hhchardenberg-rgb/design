import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";

export async function GET() {
  try {
    await requireAdmin();
    const matches = await prisma.match.findMany({
      orderBy: { date: "desc" },
      include: { team: true, opponent: true },
      take: 100,
    });
    return NextResponse.json({ matches });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const match = await prisma.match.create({
      data: {
        teamId: body.teamId,
        opponentId: body.opponentId,
        isHome: body.isHome ?? true,
        date: new Date(body.date),
        competition: body.competition,
        round: body.round,
        location: body.location,
        status: body.status ?? "SCHEDULED",
      },
      include: { team: true, opponent: true },
    });
    return NextResponse.json({ match });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
