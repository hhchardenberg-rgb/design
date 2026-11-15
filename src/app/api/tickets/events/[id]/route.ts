import { handleTickets } from "@/lib/tickets/api";
import { saveEvent, saveFullhouseEventSettings } from "@/lib/tickets/catalog.server";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleTickets(["events:manage"], async (actor) => saveEvent(actor, (await params).id, await req.json()));
}

/** Fullhouse-wedstrijd: alleen status, seizoen, capaciteit en herintrede. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleTickets(["events:manage"], async (actor) => saveFullhouseEventSettings(actor, (await params).id, await req.json()));
}
