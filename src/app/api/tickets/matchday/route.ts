import { ApiError } from "@/lib/api-guards";
import { handleTickets } from "@/lib/tickets/api";
import { matchdayOverview } from "@/lib/tickets/matchday.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleTickets(["scan:history"], async () => {
    const eventId = new URL(req.url).searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "Kies een wedstrijd.");
    return matchdayOverview(eventId);
  });
}
