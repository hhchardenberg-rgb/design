import { handleTickets } from "@/lib/tickets/api";
import { listBatches } from "@/lib/tickets/batches.server";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleTickets(["tickets:read"], async () => ({ batches: await listBatches() }));
}
