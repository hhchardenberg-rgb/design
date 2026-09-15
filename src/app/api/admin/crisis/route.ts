import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";

export async function GET() {
  try {
    await requireAdmin();
    const protocols = await prisma.crisisProtocol.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
    return NextResponse.json({ protocols });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    if (!body.title) throw new ApiError(400, "Titel is verplicht.");

    const protocol = await prisma.crisisProtocol.create({
      data: {
        title: body.title,
        description: body.description || null,
        whoToCall: body.whoToCall || null,
        whoMayCommunicate: body.whoMayCommunicate || null,
        steps: body.steps || null,
      },
    });
    return NextResponse.json({ protocol });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
