import { ApiError } from "@/lib/api-guards";
import { handleScan } from "@/lib/tickets/scan-api";
import { offlineCache } from "@/lib/tickets/scan.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleScan(req, async () => {
    const eventId = new URL(req.url).searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "Kies een wedstrijd.");
    return offlineCache(eventId);
  });
}
