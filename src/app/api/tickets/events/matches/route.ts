import { handleTickets } from "@/lib/tickets/api";
import { designtoolMatches } from "@/lib/tickets/catalog.server";

export const dynamic = "force-dynamic";

/** Wedstrijden uit de designtool, om een HHC Tickets-wedstrijd aan te koppelen. */
export async function GET() {
  return handleTickets(["events:manage"], async () => ({ matches: await designtoolMatches() }));
}
