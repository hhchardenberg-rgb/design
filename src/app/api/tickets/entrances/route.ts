import { handleTickets } from "@/lib/tickets/api";
import { saveEntrance } from "@/lib/tickets/scanner-admin.server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleTickets(["scanners:manage"], async (actor) => saveEntrance(actor, null, await req.json()));
}
