import { ApiError } from "@/lib/api-guards";
import { handleTickets } from "@/lib/tickets/api";
import { syncFullhouseInBackground } from "@/lib/tickets/fullhouse/background.server";
import { matchdayOverview } from "@/lib/tickets/matchday.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  return handleTickets(["scan:history"], async () => {
    const eventId = new URL(req.url).searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "Kies een wedstrijd.");
    const out = await matchdayOverview(eventId);
    // Tijdens een wedstrijd blijft Wedstrijddag live open: zo blijft de Fullhouse-kopie ook dan vers.
    syncFullhouseInBackground();
    return out;
  });
}
