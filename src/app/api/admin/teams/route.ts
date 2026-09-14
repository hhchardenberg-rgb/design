import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";

export async function GET() {
  try {
    await requireAdmin();
    const teams = await prisma.team.findMany({
      orderBy: { name: "asc" },
      include: { club: true, players: { orderBy: { number: "asc" } } },
    });
    return NextResponse.json({ teams });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const team = await prisma.team.create({
      data: {
        clubId: body.clubId,
        name: body.name,
        shortName: body.shortName,
        logoUrl: body.logoUrl,
        competition: body.competition,
        ageGroup: body.ageGroup,
      },
    });
    return NextResponse.json({ team });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
