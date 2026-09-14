import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiErrorResponse } from "@/lib/api-guards";

export async function GET(req: Request) {
  try {
    await requireUser();
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    const players = await prisma.player.findMany({
      where: {
        active: true,
        OR: q
          ? [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
            ]
          : undefined,
      },
      include: { team: true },
      orderBy: { lastName: "asc" },
      take: 10,
    });
    return NextResponse.json({
      items: players.map((p) => ({
        id: p.id,
        label: `${p.firstName} ${p.lastName}`,
        sublabel: p.team.shortName ?? p.team.name,
        imageUrl: p.photoUrl,
        meta: p,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
