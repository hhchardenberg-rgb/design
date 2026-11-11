import { handleTickets } from "@/lib/tickets/api";
import { shareLink } from "@/lib/tickets/delivery.server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { channel?: string };
  return handleTickets(["tickets:resend"], (actor) => shareLink(actor, id, body.channel === "WHATSAPP" ? "WHATSAPP" : "LINK_COPY"));
}
