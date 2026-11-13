import { handleTickets } from "@/lib/tickets/api";
import { resetScannerPin } from "@/lib/tickets/scanner-admin.server";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleTickets(["scanners:manage"], (actor) => resetScannerPin(actor, id));
}
