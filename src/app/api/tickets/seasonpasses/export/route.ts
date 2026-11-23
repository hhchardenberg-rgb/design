import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireTickets } from "@/lib/tickets/authz.server";
import { seasonAttendanceExport } from "@/lib/tickets/seasonpass.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Excel met de aanwezigheid van alle seizoenskaarthouders van een seizoen. */
export async function GET(req: Request) {
  try {
    const actor = await requireTickets("tickets:read", "exports:export");
    const file = await seasonAttendanceExport(actor, new URL(req.url).searchParams.get("seizoen") ?? undefined);
    return new NextResponse(Buffer.from(file.body), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="hhc-${file.name}"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
