import { handleTickets } from "@/lib/tickets/api";
import { saveSeason } from "@/lib/tickets/catalog.server";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleTickets(["types:manage"], async (actor) => saveSeason(actor, (await params).id, await req.json()));
}
