import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiErrorResponse } from "@/lib/api-guards";

/** Templategalerij voor gebruikers: "Wat wil je maken?" (sectie 9). */
export async function GET() {
  try {
    await requireUser();
    const templates = await prisma.template.findMany({
      where: { status: "PUBLISHED", activeVersionId: { not: null } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        category: true,
        thumbnailUrl: true,
        activeVersion: { select: { id: true, width: true, height: true, schemaJson: true } },
      },
    });
    return NextResponse.json({ templates });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
