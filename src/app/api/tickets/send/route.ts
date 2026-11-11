import { handleTickets } from "@/lib/tickets/api";
import { sendTicketMails } from "@/lib/tickets/delivery.server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  return handleTickets(["tickets:resend"], async (actor) => sendTicketMails(actor, await req.json()));
}
