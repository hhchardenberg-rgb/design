import { handleTickets } from "@/lib/tickets/api";
import { adoptAllCatalog, catalogOverview, refreshCatalogAction } from "@/lib/tickets/fullhouse/catalog.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return handleTickets(["sync:read"], (actor) => catalogOverview(actor));
}

/** { action: "refresh" } haalt kaartsoorten en vakken opnieuw op; { action: "adoptAll" } neemt alles wat nog niet gekoppeld is over als HHC-type of -vak. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  return handleTickets(["sync:manage"], (actor) => (body.action === "adoptAll" ? adoptAllCatalog(actor) : refreshCatalogAction(actor)));
}
