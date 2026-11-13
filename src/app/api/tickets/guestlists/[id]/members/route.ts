import { ApiError } from "@/lib/api-guards";
import { handleTickets } from "@/lib/tickets/api";
import { addMembers, removeMember } from "@/lib/tickets/guestlist.server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleTickets(["tickets:bulk"], async (actor) => addMembers(actor, id, await req.json()));
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleTickets(["tickets:bulk"], async (actor) => {
    const memberId = new URL(req.url).searchParams.get("memberId");
    if (!memberId) throw new ApiError(400, "Kies een relatie.");
    return removeMember(actor, id, memberId);
  });
}
