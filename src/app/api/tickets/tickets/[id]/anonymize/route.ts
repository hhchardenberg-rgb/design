import { handleTickets } from "@/lib/tickets/api";
import { anonymize } from "@/lib/tickets/tickets.server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleTickets(["tickets:anonymize"], async (actor) => {
    const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
    return anonymize(actor, (await params).id, typeof body.reason === "string" ? body.reason : "");
  });
}
