import { handleTickets } from "@/lib/tickets/api";
import { syncFullhouseInBackground } from "@/lib/tickets/fullhouse/background.server";
import { fullhouseOverview } from "@/lib/tickets/fullhouse/sync.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return handleTickets(["sync:read"], async (actor) => {
    const out = await fullhouseOverview(actor);
    syncFullhouseInBackground();
    return out;
  });
}
