import { handleTickets } from "@/lib/tickets/api";
import { scanHistory, scanStats } from "@/lib/tickets/scan.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return handleTickets(["scan:history"], async () => {
    const eventId = sp.get("wedstrijd") ?? undefined;
    return {
      history: await scanHistory({ eventId, result: sp.get("uitslag") ?? undefined, page: Number(sp.get("pagina")) || 1 }),
      stats: eventId ? await scanStats(eventId) : null,
    };
  });
}
