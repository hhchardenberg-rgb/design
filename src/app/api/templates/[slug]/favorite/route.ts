import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";

const body = z.object({ favorite: z.boolean() });

/** Template als favoriet markeren of weghalen (per gebruiker). */
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireUser();
    const { slug } = await params;
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "Ongeldig verzoek.");
    const template = await prisma.template.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (!template || template.status !== "PUBLISHED") throw new ApiError(404, "Template niet gevonden.");
    const key = { userId_templateId: { userId: user.id, templateId: template.id } };
    if (parsed.data.favorite) {
      await prisma.templateFavorite.upsert({ where: key, create: { userId: user.id, templateId: template.id }, update: {} });
    } else {
      await prisma.templateFavorite.deleteMany({ where: { userId: user.id, templateId: template.id } });
    }
    return NextResponse.json({ favorite: parsed.data.favorite });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
