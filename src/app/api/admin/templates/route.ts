import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";

export async function GET() {
  try {
    await requireAdmin();
    const templates = await prisma.template.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        activeVersion: { select: { id: true, versionNumber: true, status: true } },
        versions: { select: { id: true, versionNumber: true, status: true }, orderBy: { versionNumber: "desc" } },
      },
    });
    return NextResponse.json({ templates });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const { id, ...data } = body;
    const template = await prisma.template.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        category: data.category,
        status: data.status,
        sortOrder: data.sortOrder,
        thumbnailUrl: data.thumbnailUrl,
      },
    });
    return NextResponse.json({ template });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
