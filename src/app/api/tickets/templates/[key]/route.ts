import { handleTickets } from "@/lib/tickets/api";
import { saveTemplate } from "@/lib/tickets/delivery.server";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return handleTickets(["templates:manage"], async (actor) => saveTemplate(actor, key, await req.json()));
}
