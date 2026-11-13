import { handleTickets } from "@/lib/tickets/api";
import { setPromoActive } from "@/lib/tickets/promo.server";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleTickets(["tickets:bulk"], async (actor) => setPromoActive(actor, id, !!(await req.json()).active));
}
