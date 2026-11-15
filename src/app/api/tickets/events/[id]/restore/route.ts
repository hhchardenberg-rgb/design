import { handleTickets } from "@/lib/tickets/api";
import { restoreEvent } from "@/lib/tickets/catalog.server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleTickets(["events:delete"], async (actor) => restoreEvent(actor, (await params).id));
}
