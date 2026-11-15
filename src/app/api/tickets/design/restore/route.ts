import { handleTickets } from "@/lib/tickets/api";
import { restoreVersion } from "@/lib/tickets/design/admin.server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handleTickets(["design:edit"], (actor) => restoreVersion(actor, body));
}
