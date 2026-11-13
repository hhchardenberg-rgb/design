import { handleTickets } from "@/lib/tickets/api";
import { renewSeasonPasses } from "@/lib/tickets/seasonpass.server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleTickets(["tickets:issue"], async (actor) => renewSeasonPasses(actor, await req.json()));
}
