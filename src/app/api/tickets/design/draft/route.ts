import { handleTickets } from "@/lib/tickets/api";
import { discardDraft, saveDraft } from "@/lib/tickets/design/admin.server";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handleTickets(["design:edit"], (actor) => saveDraft(actor, body));
}

export async function DELETE(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope") ?? "";
  return handleTickets(["design:edit"], (actor) => discardDraft(actor, scope));
}
