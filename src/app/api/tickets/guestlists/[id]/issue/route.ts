import { handleTickets } from "@/lib/tickets/api";
import { issueFromList } from "@/lib/tickets/guestlist.server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleTickets(["tickets:issue", "tickets:bulk"], async (actor) => issueFromList(actor, id, await req.json()));
}
