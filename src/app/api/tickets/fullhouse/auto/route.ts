import { ApiError } from "@/lib/api-guards";
import { handleTickets } from "@/lib/tickets/api";
import { runAutoSync } from "@/lib/tickets/fullhouse/auto-sync.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Knop "Nu synchroniseren": direct een volledige automatische ronde (evenementen + wijzigingen per wedstrijd). */
export async function POST() {
  return handleTickets(["sync:manage"], async (actor) => {
    const r = await runAutoSync({ trigger: "manual", who: { id: actor.id, name: actor.name } });
    if (r.skipped === "testmodus") throw new ApiError(400, "Testmodus: er is geen echte koppeling met Fullhouse.");
    return r;
  });
}
