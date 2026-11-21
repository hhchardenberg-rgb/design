import { NextResponse } from "next/server";
import { ApiError, apiErrorResponse, requireRole } from "@/lib/api-guards";
import { handleTickets } from "@/lib/tickets/api";
import { supportSearch } from "@/lib/tickets/support-search.server";

export const dynamic = "force-dynamic";

/**
 * Zoektool in Klantenservice. Alleen POST: de zoekterm (naam, e-mail, ordernummer) staat in de
 * body en komt dus nooit in een URL, serverlog of browsergeschiedenis.
 * Vereist de Klantenservice-rol én het Tickets-recht "support:search".
 */
export async function POST(req: Request) {
  try {
    await requireRole("TICKETING");
  } catch (error) {
    return apiErrorResponse(error);
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrorResponse(new ApiError(400, "Ongeldig verzoek."));
  }
  const res = await handleTickets(["support:search"], (actor) => supportSearch(actor, body));
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export function GET() {
  return NextResponse.json({ error: "Gebruik POST." }, { status: 405 });
}
