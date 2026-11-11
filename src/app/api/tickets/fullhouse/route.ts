import { handleTickets } from "@/lib/tickets/api";
import { fullhouseOverview } from "@/lib/tickets/fullhouse/sync.server";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleTickets(["sync:read"], (actor) => fullhouseOverview(actor));
}
