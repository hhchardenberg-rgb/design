import { handleTickets } from "@/lib/tickets/api";
import { updateSet } from "@/lib/tickets/design/admin.server";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return handleTickets(["design:publish"], (actor) => updateSet(actor, id, body));
}
