import { NextResponse } from "next/server";
import { requireHubAdmin, apiErrorResponse } from "@/lib/api-guards";
import { activateVersion } from "@/lib/design/template-versions.server";

/**
 * Zet een versie actief voor nieuwe ontwerpen. Bestaande ontwerpen blijven
 * aan hun eigen versie gekoppeld. Geblokkeerd bij kritieke fouten.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    await requireHubAdmin();
    const { id, versionId } = await params;
    const result = await activateVersion(id, versionId);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
