import { handleTickets } from "@/lib/tickets/api";
import { saveZone } from "@/lib/tickets/catalog.server";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleTickets(["types:manage"], async (actor) => saveZone(actor, (await params).id, await req.json()));
}
