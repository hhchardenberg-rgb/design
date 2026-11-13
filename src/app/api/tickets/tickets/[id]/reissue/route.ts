import { handleTickets } from "@/lib/tickets/api";
import { reissue } from "@/lib/tickets/tickets.server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleTickets(["tickets:resend"], async (actor) => reissue(actor, (await params).id, await req.json()));
}
