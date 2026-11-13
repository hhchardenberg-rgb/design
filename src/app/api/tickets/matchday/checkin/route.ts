import { handleTickets } from "@/lib/tickets/api";
import { manualCheckIn } from "@/lib/tickets/matchday.server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleTickets(["scan:override"], async (actor) => manualCheckIn(actor, await req.json()));
}
