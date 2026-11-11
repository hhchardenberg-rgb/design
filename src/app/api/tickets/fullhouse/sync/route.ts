import { handleTickets } from "@/lib/tickets/api";
import { syncEventAction } from "@/lib/tickets/fullhouse/sync.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { eventId?: string; full?: boolean };
  return handleTickets(["sync:manage"], (actor) => syncEventAction(actor, String(body.eventId ?? ""), body.full === true));
}
