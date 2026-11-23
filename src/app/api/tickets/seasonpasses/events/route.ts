import { handleTickets } from "@/lib/tickets/api";
import { seasonAttendanceByEvent } from "@/lib/tickets/seasonpass.server";

export const dynamic = "force-dynamic";

/** Aanwezigheid van seizoenskaarthouders per duel van een seizoen. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return handleTickets(["tickets:read"], (actor) => seasonAttendanceByEvent(actor, { seasonId: sp.get("seizoen") ?? undefined }));
}
