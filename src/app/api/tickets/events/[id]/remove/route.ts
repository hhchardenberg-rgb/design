import { handleTickets } from "@/lib/tickets/api";
import { eventUsage, removeEvent } from "@/lib/tickets/catalog.server";

export const dynamic = "force-dynamic";

/** Wat hangt er aan deze wedstrijd, en kan hij verwijderd of alleen gearchiveerd worden? */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleTickets(["events:delete"], async () => eventUsage((await params).id));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleTickets(["events:delete"], async (actor) => removeEvent(actor, (await params).id, await req.json()));
}
