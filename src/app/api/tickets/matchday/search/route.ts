import { handleTickets } from "@/lib/tickets/api";
import { manualSearch } from "@/lib/tickets/matchday.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleTickets(["scan:override"], (actor) => manualSearch(actor, new URL(req.url).searchParams.get("q") ?? ""));
}
