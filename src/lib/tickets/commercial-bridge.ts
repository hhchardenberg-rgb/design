// Koppeling met Commerciële Zaken (implementatie: commercial-bridge.server.ts). Dit is de ene ingang
// waarlangs CZ (relaties, sponsorafspraken, ticketquota, bedrijfskaarten) tickets laat
// uitgeven. Er is nu nog geen implementatie; de vorm ligt vast, zodat beide kanten erop
// kunnen bouwen. Dezelfde regels als in het scherm: rechten, drempel/goedkeuring, audit.
//
// Idempotentie: (originSystem, externalRef) is uniek op een ticket. Een tweede aanroep
// met dezelfde referentie maakt dus nooit een dubbel ticket.

import type { TicketsActor } from "./authz.server";
import type { z } from "zod";
import type { holderSchema } from "./schemas";

export interface TicketIssueRequest {
  /** Bijvoorbeeld "commercial". */
  originSystem: string;
  /** Unieke referentie per ticket in het bronsysteem, bv. "contract:<id>:quota:3". */
  externalRef: string;
  /** Het CZ-bedrijf waarvoor de kaart is (alleen het id; gegevens blijven in CZ). */
  commercialCompanyId?: string | null;
  typeId: string;
  zoneId?: string | null;
  eventIds?: string[];
  seasonId?: string | null;
  holder: z.input<typeof holderSchema>;
}

export interface TicketIssueResult {
  externalRef: string;
  ticketId: string | null;
  status: "ISSUED" | "ALREADY_ISSUED" | "PENDING_APPROVAL" | "REJECTED";
  message?: string;
}

/** Contract van de koppeling; geïmplementeerd in commercial-bridge.server.ts. */
export interface CommercialTicketBridge {
  issueFromCommercial(actor: TicketsActor, requests: TicketIssueRequest[]): Promise<TicketIssueResult[]>;
  /** Hoeveel tickets een CZ-bedrijf in een seizoen al heeft (voor quota). */
  usageForCompany(commercialCompanyId: string, seasonId: string): Promise<{ issued: number; used: number }>;
}
