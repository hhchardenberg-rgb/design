import { handleTickets } from "@/lib/tickets/api";
import { updateScanner } from "@/lib/tickets/scanner-admin.server";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleTickets(["scanners:manage"], async (actor) => updateScanner(actor, id, await req.json()));
}
