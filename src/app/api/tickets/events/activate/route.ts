import { handleTickets } from "@/lib/tickets/api";
import { activateDrafts } from "@/lib/tickets/catalog.server";

export async function POST() {
  return handleTickets(["events:manage"], async (actor) => activateDrafts(actor));
}
