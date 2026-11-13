import { handleTickets } from "@/lib/tickets/api";
import { reviewBatch } from "@/lib/tickets/batches.server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleTickets(["bulk:approve"], async (actor) => reviewBatch(actor, (await params).id, await req.json()));
}
