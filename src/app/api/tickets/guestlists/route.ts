import { handleTickets } from "@/lib/tickets/api";
import { listGuestLists, saveGuestList } from "@/lib/tickets/guestlist.server";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleTickets(["tickets:bulk"], (actor) => listGuestLists(actor));
}

export async function POST(req: Request) {
  return handleTickets(["tickets:bulk"], async (actor) => saveGuestList(actor, null, await req.json()));
}
