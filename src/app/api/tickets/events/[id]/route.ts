import { handleTickets } from "@/lib/tickets/api";
import { saveEvent } from "@/lib/tickets/catalog.server";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleTickets(["events:manage"], async (actor) => saveEvent(actor, (await params).id, await req.json()));
}
