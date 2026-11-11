import { handleTickets } from "@/lib/tickets/api";
import { listZones, saveZone } from "@/lib/tickets/catalog.server";

export async function GET() {
  return handleTickets(["types:read"], async () => ({ zones: await listZones() }));
}

export async function POST(req: Request) {
  return handleTickets(["types:manage"], async (actor) => saveZone(actor, null, await req.json()));
}
