import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireTickets, type TicketsActor } from "./authz.server";
import type { TicketPermission } from "./permissions";

/**
 * Standaard omhulsel voor HHC Tickets-API's: flag, sessie, toegang en de genoemde
 * bevoegdheden centraal; de service controleert daarna wat specifiek is. Fouten uniform.
 */
export async function handleTickets(permissions: TicketPermission[], fn: (actor: TicketsActor) => Promise<unknown>) {
  try {
    const actor = await requireTickets(...permissions);
    const result = await fn(actor);
    return NextResponse.json(result ?? { ok: true });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Controleer de ingevulde gegevens." }, { status: 400 });
    return apiErrorResponse(error);
  }
}
