import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";

export async function GET() {
  try {
    await requireUser();
    const releases = await prisma.pressRelease.findMany({
      orderBy: { date: "desc" },
      include: { author: { select: { name: true } } },
    });
    return NextResponse.json({ releases });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    if (!body.title || !body.date || !body.lead || !body.body) {
      throw new ApiError(400, "Titel, datum, inleiding en tekst zijn verplicht.");
    }

    const release = await prisma.pressRelease.create({
      data: {
        title: body.title,
        date: new Date(body.date),
        lead: body.lead,
        body: body.body,
        authorId: user.id,
      },
      include: { author: { select: { name: true } } },
    });
    return NextResponse.json({ release });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
