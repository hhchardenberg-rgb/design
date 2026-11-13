import { handleTickets } from "@/lib/tickets/api";
import { listSeasons, saveSeason } from "@/lib/tickets/catalog.server";

export async function GET() {
  return handleTickets(["types:read"], async () => ({ seasons: await listSeasons() }));
}

export async function POST(req: Request) {
  return handleTickets(["types:manage"], async (actor) => saveSeason(actor, null, await req.json()));
}
