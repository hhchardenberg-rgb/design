import { handleTickets } from "@/lib/tickets/api";
import { transferTicket } from "@/lib/tickets/seasonpass.server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleTickets(["tickets:issue", "tickets:resend"], async (actor) => transferTicket(actor, id, await req.json()));
}
