import { handleTickets } from "@/lib/tickets/api";
import { changeEvent } from "@/lib/tickets/eventchange.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleTickets(["events:manage"], async (actor) => changeEvent(actor, id, await req.json()));
}
