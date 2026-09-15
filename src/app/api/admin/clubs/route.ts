import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";

export async function GET() {
  try {
    await requireAdmin();
    const clubs = await prisma.club.findMany({
      orderBy: { createdAt: "asc" },
      include: { teams: { include: { players: { orderBy: { lastName: "asc" } } } } },
    });
    return NextResponse.json({ clubs });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const club = await prisma.club.create({
      data: {
        name: body.name,
        shortName: body.shortName,
        logoUrl: body.logoUrl,
        isOwnClub: body.isOwnClub ?? false,
      },
    });
    return NextResponse.json({ club });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
