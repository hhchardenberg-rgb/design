import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const teamId = new URL(req.url).searchParams.get("teamId") ?? undefined;
    const players = await prisma.player.findMany({
      where: teamId ? { teamId } : undefined,
      orderBy: [{ teamId: "asc" }, { number: "asc" }],
      include: { team: true },
    });
    return NextResponse.json({ players });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const player = await prisma.player.create({
      data: {
        teamId: body.teamId,
        firstName: body.firstName,
        lastName: body.lastName,
        number: body.number ? Number(body.number) : undefined,
        position: body.position,
        photoUrl: body.photoUrl,
        active: body.active ?? true,
      },
    });
    return NextResponse.json({ player });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
