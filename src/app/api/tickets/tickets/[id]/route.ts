import { handleTickets } from "@/lib/tickets/api";
import { getTicket } from "@/lib/tickets/tickets.server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleTickets(["tickets:read"], async (actor) => getTicket(actor, (await params).id));
}
