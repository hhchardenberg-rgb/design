import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    const match = await prisma.match.update({
      where: { id },
      data: {
        teamId: body.teamId,
        opponentId: body.opponentId,
        isHome: body.isHome,
        date: body.date ? new Date(body.date) : undefined,
        competition: body.competition,
        round: body.round,
        location: body.location,
        scoreHome: body.scoreHome !== undefined ? Number(body.scoreHome) : undefined,
        scoreAway: body.scoreAway !== undefined ? Number(body.scoreAway) : undefined,
        status: body.status,
      },
      include: { team: true, opponent: true },
    });
    return NextResponse.json({ match });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    await prisma.match.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
