import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { batchResponse, createBatch } from "@/lib/design/batch.server";

/** De laatste batches van de gebruiker. */
export async function GET() {
  try {
    const user = await requireUser();
    const batches = await prisma.designBatch.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    return NextResponse.json({ batches: batches.map(batchResponse) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    if (body.source !== "match" && body.source !== "player") throw new ApiError(400, "Kies wedstrijden of spelers.");
    const batch = await createBatch(user, {
      templateIds: strings(body.templateIds),
      source: body.source,
      sourceIds: strings(body.sourceIds),
      format: String(body.format ?? "PNG"),
    });
    return NextResponse.json({ batch: { id: batch.id } }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
