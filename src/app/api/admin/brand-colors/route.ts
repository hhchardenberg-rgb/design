import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";

export async function GET() {
  try {
    await requireAdmin();
    const colors = await prisma.brandColor.findMany({ orderBy: { sortOrder: "asc" } });
    return NextResponse.json({ colors });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const color = await prisma.brandColor.create({
      data: {
        name: body.name,
        hex: body.hex,
        group: body.group ?? "algemeen",
        sortOrder: body.sortOrder ?? 0,
      },
    });
    return NextResponse.json({ color });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
