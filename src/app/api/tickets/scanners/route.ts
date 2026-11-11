import { handleTickets } from "@/lib/tickets/api";
import { createScanner, listScanners } from "@/lib/tickets/scanner-admin.server";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleTickets(["scanners:manage"], (actor) => listScanners(actor));
}

export async function POST(req: Request) {
  return handleTickets(["scanners:manage"], async (actor) => createScanner(actor, await req.json()));
}
