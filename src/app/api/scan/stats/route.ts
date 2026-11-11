import { ApiError } from "@/lib/api-guards";
import { handleScan } from "@/lib/tickets/scan-api";
import { scanStats } from "@/lib/tickets/scan.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleScan(req, async (actor) => {
    if (!actor.canSeeStats) throw new ApiError(403, "Alleen voor beheerders met toegang tot de scanhistorie.");
    const eventId = new URL(req.url).searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "Kies een wedstrijd.");
    return scanStats(eventId);
  });
}
