import { handleTickets } from "@/lib/tickets/api";
import { auditPage } from "@/lib/tickets/dashboard.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return handleTickets(["audit:read"], async () => auditPage({ action: sp.get("actie") ?? undefined, ticketId: sp.get("ticket") ?? undefined, page: Number(sp.get("pagina")) || 1 }));
}
