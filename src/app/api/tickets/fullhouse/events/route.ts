import { handleTickets } from "@/lib/tickets/api";
import { importFullhouseEvents } from "@/lib/tickets/fullhouse/sync.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  return handleTickets(["sync:manage"], (actor) => importFullhouseEvents(actor));
}
