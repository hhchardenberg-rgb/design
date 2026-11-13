import { handleTickets } from "@/lib/tickets/api";
import { seasonPassDetail } from "@/lib/tickets/seasonpass.server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleTickets(["tickets:read"], (actor) => seasonPassDetail(actor, id));
}
