import { handleTickets } from "@/lib/tickets/api";
import { seasonOverview } from "@/lib/tickets/design/admin.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const season = new URL(req.url).searchParams.get("season") ?? "";
  return handleTickets(["design:read"], (actor) => seasonOverview(actor, season));
}
