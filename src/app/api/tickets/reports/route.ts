import { ApiError } from "@/lib/api-guards";
import { handleTickets } from "@/lib/tickets/api";
import { eventReport } from "@/lib/tickets/reports.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleTickets(["reports:read"], async (actor) => {
    const eventId = new URL(req.url).searchParams.get("wedstrijd");
    if (!eventId) throw new ApiError(400, "Kies een wedstrijd.");
    return eventReport(actor, eventId);
  });
}
