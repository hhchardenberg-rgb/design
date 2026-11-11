import { handleTickets } from "@/lib/tickets/api";
import { sendTicketMailTo } from "@/lib/tickets/delivery.server";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleTickets(["tickets:resend"], (actor) => sendTicketMailTo(actor, id));
}
