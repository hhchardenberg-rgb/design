import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireUser();
    const { slug } = await params;
    const template = await prisma.template.findUnique({
      where: { slug },
      include: {
        activeVersion: { include: { fields: { orderBy: { sortOrder: "asc" } } } },
      },
    });
    if (!template || !template.activeVersion || template.status !== "PUBLISHED") {
      throw new ApiError(404, "Template niet gevonden.");
    }
    return NextResponse.json({ template });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
