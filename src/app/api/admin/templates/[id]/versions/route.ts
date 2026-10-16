import { NextResponse } from "next/server";
import { requireHubAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { createDraftFromVersion } from "@/lib/design/template-versions.server";

/** Nieuwe conceptversie op basis van een bestaande versie (om een actieve versie aan te passen). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireHubAdmin();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (typeof body.fromVersionId !== "string") throw new ApiError(400, "fromVersionId is verplicht.");
    const version = await createDraftFromVersion(id, body.fromVersionId);
    return NextResponse.json({ version: { id: version.id, versionNumber: version.versionNumber } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
