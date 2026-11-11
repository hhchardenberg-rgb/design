import { handleTickets } from "@/lib/tickets/api";
import { issueTickets, listTickets } from "@/lib/tickets/tickets.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return handleTickets(["tickets:read"], async (actor) =>
    listTickets(actor, {
      q: sp.get("q") ?? undefined,
      status: sp.get("status") ?? undefined,
      typeId: sp.get("type") ?? undefined,
      eventId: sp.get("wedstrijd") ?? undefined,
      category: sp.get("categorie") ?? undefined,
      page: Number(sp.get("pagina")) || 1,
    }),
  );
}

/** Eén of meer tickets uitgeven. Boven de drempel wordt het een bulkaanvraag. */
export async function POST(req: Request) {
  const origin = new URL(req.url).searchParams.get("bron");
  return handleTickets(["tickets:issue"], async (actor) => issueTickets(actor, await req.json(), origin === "CSV" || origin === "XLSX" ? origin : "MANUAL"));
}
