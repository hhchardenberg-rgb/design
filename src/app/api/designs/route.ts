import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { canDesign } from "@/lib/design/permissions";
import { createDesign } from "@/lib/design/service.server";
import { designErrorResponse } from "@/lib/design/api";

/** Recente ontwerpen van de ingelogde gebruiker (dashboard). */
export async function GET() {
  try {
    const user = await requireUser();
    if (!canDesign(user.roles, "design:create")) throw new ApiError(403, "Je hebt geen toegang tot de designtool.");
    const designs = await prisma.generatedDesign.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 30,
      include: {
        templateVersion: { include: { template: true } },
        match: { include: { opponent: true } },
      },
    });
    return NextResponse.json({ designs });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/**
 * Maakt een concept aan. De wizard roept dit pas aan bij de eerste echte
 * wijziging; alleen een template bekijken levert geen concept op.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    if (typeof body.templateVersionId !== "string") throw new ApiError(400, "templateVersionId is verplicht.");
    const design = await createDesign(user, {
      templateVersionId: body.templateVersionId,
      matchId: typeof body.matchId === "string" ? body.matchId : null,
      title: typeof body.title === "string" ? body.title : null,
      formData: body.formData ?? {},
    });
    return NextResponse.json({ design });
  } catch (error) {
    return designErrorResponse(error);
  }
}
