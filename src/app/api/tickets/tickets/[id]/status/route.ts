import { handleTickets } from "@/lib/tickets/api";
import { changeStatus } from "@/lib/tickets/tickets.server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleTickets(["tickets:block"], async (actor) => changeStatus(actor, (await params).id, await req.json()));
}
