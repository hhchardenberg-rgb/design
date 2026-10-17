import { NextResponse } from "next/server";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { loadBatch } from "@/lib/design/batch.server";

/**
 * Download van de ZIP. Het bestand kan groter zijn dan een serverfunctie mag
 * teruggeven, dus na de rechtencontrole volgt een doorverwijzing naar de opslag.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const batch = await loadBatch(user, id);
    if (!batch.zipUrl) throw new ApiError(404, "De ZIP is nog niet klaar.");
    const url = new URL(batch.zipUrl, req.url);
    if (url.hostname.endsWith("blob.vercel-storage.com")) url.searchParams.set("download", "1");
    return NextResponse.redirect(url, 302);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
