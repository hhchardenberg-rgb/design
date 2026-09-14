import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";

/** Recente ontwerpen van de ingelogde gebruiker (dashboard, sectie 16). */
export async function GET() {
  try {
    const user = await requireUser();
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

/** Wizard stap 1: maak direct een concept aan zodat autosave iets heeft om naar te schrijven. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    if (!body.templateVersionId) throw new ApiError(400, "templateVersionId is verplicht.");

    const version = await prisma.templateVersion.findUniqueOrThrow({
      where: { id: body.templateVersionId },
      include: { template: true },
    });

    const design = await prisma.generatedDesign.create({
      data: {
        templateVersionId: version.id,
        userId: user.id,
        matchId: body.matchId ?? undefined,
        title: body.title ?? version.template.name,
        formData: body.formData ?? {},
        width: version.width,
        height: version.height,
        status: "DRAFT",
      },
    });
    return NextResponse.json({ design });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
