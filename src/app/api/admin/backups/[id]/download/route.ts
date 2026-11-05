import { NextResponse } from "next/server";
import { ApiError, apiErrorResponse, requireAdmin } from "@/lib/api-guards";
import { backupDownloadUrl } from "@/lib/backup/service.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Download van een (versleutelde) back-up: na de rechtencontrole volgt een doorverwijzing naar
 * een kortlevende link in de back-upopslag. Zonder BACKUP_ENCRYPTION_KEY is het bestand onleesbaar.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await params;
    const url = await backupDownloadUrl(id);
    if (!url) throw new ApiError(404, "Deze back-up is niet (meer) beschikbaar.");
    console.info(`[backup] back-up ${id} gedownload door ${user.email}`);
    return NextResponse.redirect(url, 302);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
