import { handleTickets } from "@/lib/tickets/api";
import { editorData } from "@/lib/tickets/design/admin.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope") ?? "club";
  return handleTickets(["design:read"], (actor) => editorData(actor, scope));
}
