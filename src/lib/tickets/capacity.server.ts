import { prisma } from "@/lib/prisma";
import { coveringTickets } from "./scan.server";

/**
 * Waarschuwing (geen blokkade) als het aantal geldige tickets voor een wedstrijd de capaciteit
 * overschrijdt. Bewust niet afgedwongen: gasten, seizoenspassen en Fullhouse-kaarten tellen mee
 * en niet iedereen komt; de uitgever moet het wel weten. Telt HHC-tickets die nu gelden plus
 * geldige Fullhouse-kaarten van het gekoppelde duel.
 */
export async function capacityWarnings(eventIds: string[]): Promise<string[]> {
  if (!eventIds.length) return [];
  const events = await prisma.ticketEvent.findMany({ where: { id: { in: eventIds }, capacity: { gt: 0 }, status: { not: "CANCELLED" } } });
  const out: string[] = [];
  for (const e of events) {
    try {
      const [hhc, fh] = await Promise.all([coveringTickets(e), e.externalId ? prisma.ticketExternalTicket.count({ where: { eventExtId: e.externalId, status: "VALID" } }) : 0]);
      const total = hhc.length + fh;
      if (e.capacity && total > e.capacity) out.push(`Let op: voor '${e.title}' zijn nu ${total} geldige tickets (${hhc.length} HHC, ${fh} Fullhouse) bij een capaciteit van ${e.capacity}. De uitgifte is niet geblokkeerd.`);
    } catch (error) {
      console.error("[tickets-capacity] controle mislukt", e.id, error);
    }
  }
  return out;
}
