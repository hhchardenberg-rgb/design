import { NextResponse } from "next/server";
import { requireUser, apiErrorResponse } from "@/lib/api-guards";
import { batchResponse, runBatch } from "@/lib/design/batch.server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Stand van een batch. Is er nog werk, dan wordt hier een deel afgewerkt
 * (ook na een eerder afgebroken poging); de pagina vraagt dit herhaald op.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json({ batch: batchResponse(await runBatch(user, id, 35_000)) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
