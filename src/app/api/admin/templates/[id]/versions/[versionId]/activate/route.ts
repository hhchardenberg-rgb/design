import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";

/**
 * Zet een eerdere (of nieuwe) versie terug als actieve versie voor nieuwe
 * gebruikers. Bestaande GeneratedDesigns blijven gekoppeld aan de versie
 * waarmee ze gemaakt zijn (zie MASTERPROMPT sectie 18).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    await requireAdmin();
    const { id, versionId } = await params;

    await prisma.templateVersion.update({
      where: { id: versionId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    const template = await prisma.template.update({
      where: { id },
      data: { activeVersionId: versionId, status: "PUBLISHED" },
    });

    return NextResponse.json({ template });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
