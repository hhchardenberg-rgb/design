import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiErrorResponse } from "@/lib/api-guards";

export async function GET(req: Request) {
  try {
    await requireUser();
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    const opponents = await prisma.opponent.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      orderBy: { name: "asc" },
      take: 10,
    });
    return NextResponse.json({
      items: opponents.map((o) => ({ id: o.id, label: o.name, imageUrl: o.logoUrl, sublabel: undefined, meta: o })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
