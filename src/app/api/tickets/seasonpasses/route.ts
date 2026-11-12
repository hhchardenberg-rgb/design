import { handleTickets } from "@/lib/tickets/api";
import { seasonPassOverview, type PassFilter } from "@/lib/tickets/seasonpass.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const f = sp.get("filter");
  return handleTickets(["tickets:read"], (actor) => seasonPassOverview(actor, { seasonId: sp.get("seizoen") ?? undefined, q: sp.get("q") ?? undefined, filter: (f === "noshow" || f === "streak" ? f : "all") as PassFilter }));
}
