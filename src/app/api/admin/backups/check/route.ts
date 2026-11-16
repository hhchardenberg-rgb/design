import { NextResponse } from "next/server";
import { apiErrorResponse, requireAdmin } from "@/lib/api-guards";
import { runBackupCheck } from "@/lib/backup/check.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** De back-upcontrole nu uitvoeren (zonder mail). Alleen voor hoofdadmins. */
export async function POST() {
  try {
    const user = await requireAdmin();
    return NextResponse.json(await runBackupCheck({ actor: user }));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
