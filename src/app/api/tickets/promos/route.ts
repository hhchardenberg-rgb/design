import { handleTickets } from "@/lib/tickets/api";
import { listPromos, savePromo } from "@/lib/tickets/promo.server";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleTickets(["tickets:bulk"], (actor) => listPromos(actor));
}

export async function POST(req: Request) {
  return handleTickets(["tickets:bulk"], async (actor) => savePromo(actor, await req.json()));
}
