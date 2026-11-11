import { handleTickets } from "@/lib/tickets/api";
import { listEvents, listSeasons, listTypes, listZones } from "@/lib/tickets/catalog.server";

export const dynamic = "force-dynamic";

/** Keuzelijsten voor formulieren (seizoenen, vakken, tickettypes, komende wedstrijden). */
export async function GET() {
  return handleTickets(["types:read", "events:read"], async () => {
    const [seasons, zones, types, events] = await Promise.all([listSeasons(), listZones(), listTypes(), listEvents()]);
    return { seasons, zones, types, events };
  });
}
