import { handleTickets } from "@/lib/tickets/api";
import { linkCatalogItem } from "@/lib/tickets/fullhouse/catalog.server";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleTickets(["sync:manage"], async (actor) => linkCatalogItem(actor, (await params).id, await req.json()));
}
