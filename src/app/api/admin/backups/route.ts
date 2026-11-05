import { NextResponse } from "next/server";
import { ApiError, apiErrorResponse, requireAdmin } from "@/lib/api-guards";
import { BackupBusy, BackupNotConfigured, backupOverview, runBackup } from "@/lib/backup/service.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Status en historie van de back-ups. Alleen voor hoofdadmins. */
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await backupOverview());
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/** Nu een back-up maken. */
export async function POST() {
  try {
    const user = await requireAdmin();
    try {
      const run = await runBackup({ trigger: "MANUAL", user, fileBudgetMs: 120_000 });
      console.info(`[backup] handmatige back-up ${run.id} door ${user.email}`);
      return NextResponse.json({ ok: true, id: run.id });
    } catch (error) {
      if (error instanceof BackupNotConfigured) throw new ApiError(409, error.message);
      if (error instanceof BackupBusy) throw new ApiError(409, error.message);
      throw new ApiError(500, `Back-up mislukt: ${error instanceof Error ? error.message : String(error)}`);
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
