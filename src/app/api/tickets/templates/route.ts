import { handleTickets } from "@/lib/tickets/api";
import { listTemplates } from "@/lib/tickets/delivery.server";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleTickets(["templates:manage"], async () => ({ templates: await listTemplates() }));
}
