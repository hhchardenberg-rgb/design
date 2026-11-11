import { handleTickets } from "@/lib/tickets/api";
import { getTicketSettings, saveTicketSettings } from "@/lib/tickets/settings.server";
import { fullhouseConfigured } from "@/lib/tickets/fullhouse";
import { isSigningConfigured } from "@/lib/tickets/token";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleTickets(["settings:manage"], async () => ({
    settings: await getTicketSettings(),
    // Alleen of iets is ingesteld, nooit de waarde.
    config: { signing: isSigningConfigured(), fullhouse: fullhouseConfigured() },
  }));
}

export async function PUT(req: Request) {
  return handleTickets(["settings:manage"], async (actor) => saveTicketSettings(actor, await req.json()));
}
