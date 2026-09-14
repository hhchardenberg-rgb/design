import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";

export async function GET() {
  try {
    await requireAdmin();
    const opponents = await prisma.opponent.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ opponents });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const opponent = await prisma.opponent.create({
      data: {
        name: body.name,
        shortName: body.shortName,
        logoUrl: body.logoUrl,
        primaryColor: body.primaryColor,
      },
    });
    return NextResponse.json({ opponent });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
