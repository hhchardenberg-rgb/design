import { handleTickets } from "@/lib/tickets/api";
import { impact } from "@/lib/tickets/design/admin.server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handleTickets(["design:read"], (actor) => impact(actor, body));
}
