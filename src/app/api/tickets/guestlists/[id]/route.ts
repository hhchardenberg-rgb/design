import { handleTickets } from "@/lib/tickets/api";
import { deleteGuestList, getGuestList, saveGuestList } from "@/lib/tickets/guestlist.server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleTickets(["tickets:bulk"], (actor) => getGuestList(actor, id));
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleTickets(["tickets:bulk"], async (actor) => saveGuestList(actor, id, await req.json()));
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleTickets(["tickets:bulk"], (actor) => deleteGuestList(actor, id));
}
