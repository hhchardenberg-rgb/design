import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiErrorResponse } from "@/lib/api-guards";

/** Autocomplete voor de spelersdatabase (zie MASTERPROMPT sectie 14). */
export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const teamId = url.searchParams.get("teamId") ?? undefined;
    const players = await prisma.player.findMany({
      where: {
        active: true,
        teamId,
        OR: q
          ? [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
            ]
          : undefined,
      },
      include: { team: true },
      orderBy: [{ lastName: "asc" }],
      take: 15,
    });
    return NextResponse.json({ players });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
