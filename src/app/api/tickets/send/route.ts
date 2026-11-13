import { ApiError } from "@/lib/api-guards";
import { handleTickets } from "@/lib/tickets/api";
import { sendTicketMails, unsentMailCount } from "@/lib/tickets/delivery.server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  return handleTickets(["tickets:resend"], async (actor) => sendTicketMails(actor, await req.json()));
}

/** Hoeveel tickets van een wedstrijd hebben nog geen mail gehad? ?eventId=... */
export async function GET(req: Request) {
  return handleTickets(["tickets:resend"], async (actor) => {
    const eventId = new URL(req.url).searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "Kies een wedstrijd.");
    return unsentMailCount(actor, eventId);
  });
}
