import { handleTickets } from "@/lib/tickets/api";
import { listEvents, saveEvent } from "@/lib/tickets/catalog.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const all = q.get("alle") === "1";
  const archived = q.get("archief") === "1";
  return handleTickets(["events:read"], async () => ({ events: await listEvents({ includePast: all, archived }) }));
}

export async function POST(req: Request) {
  return handleTickets(["events:manage"], async (actor) => saveEvent(actor, null, await req.json()));
}
