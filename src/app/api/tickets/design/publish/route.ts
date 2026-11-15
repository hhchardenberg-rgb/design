import { handleTickets } from "@/lib/tickets/api";
import { publish } from "@/lib/tickets/design/admin.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handleTickets(["design:publish"], (actor) => publish(actor, body));
}
