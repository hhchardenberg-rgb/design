import { handleTickets } from "@/lib/tickets/api";
import { listTypes, saveType } from "@/lib/tickets/catalog.server";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleTickets(["types:read"], async () => ({ types: await listTypes() }));
}

export async function POST(req: Request) {
  return handleTickets(["types:manage"], async (actor) => saveType(actor, null, await req.json()));
}
