import { handleTickets } from "@/lib/tickets/api";
import { eventAttendance, type AttendanceFilter } from "@/lib/tickets/seasonpass.server";

export const dynamic = "force-dynamic";

/** Welke seizoenskaarthouders waren er bij dit duel wel en welke niet. */
export async function GET(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const f = sp.get("filter");
  const filter: AttendanceFilter = f === "present" || f === "absent" ? f : "all";
  return handleTickets(["tickets:read"], (actor) => eventAttendance(actor, eventId, { filter, q: sp.get("q") ?? undefined }));
}
