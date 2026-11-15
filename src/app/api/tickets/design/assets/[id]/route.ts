import { handleTickets } from "@/lib/tickets/api";
import { assetUsage, updateAsset } from "@/lib/tickets/design/admin.server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleTickets(["design:read"], async () => ({ usedIn: await assetUsage(id) }));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return handleTickets(["design:edit"], (actor) => updateAsset(actor, id, body));
}
