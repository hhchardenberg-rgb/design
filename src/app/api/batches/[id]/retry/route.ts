import { NextResponse } from "next/server";
import { requireUser, apiErrorResponse } from "@/lib/api-guards";
import { batchResponse, retryBatch } from "@/lib/design/batch.server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json({ batch: batchResponse(await retryBatch(user, id)) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
