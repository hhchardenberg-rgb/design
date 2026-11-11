// Voorbereiding op de koppeling met Commerciële Zaken (fase 5). Hier komt één ingang
// waarlangs CZ (relaties, sponsorafspraken, ticketquota, bedrijfskaarten) tickets laat
// uitgeven. Er is nu nog geen implementatie; de vorm ligt vast, zodat beide kanten erop
// kunnen bouwen. Dezelfde regels als in het scherm: rechten, drempel/goedkeuring, audit.
//
// Idempotentie: (originSystem, externalRef) is uniek op een ticket. Een tweede aanroep
// met dezelfde referentie maakt dus nooit een dubbel ticket.

import type { HolderInput } from "./schemas";

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
  holder: HolderInput;
}

export interface TicketIssueResult {
  externalRef: string;
  ticketId: string | null;
  status: "ISSUED" | "ALREADY_ISSUED" | "PENDING_APPROVAL" | "REJECTED";
  message?: string;
}

/** Contract voor de toekomstige service; wordt in fase 5 geïmplementeerd. */
export interface CommercialTicketBridge {
  issueFromCommercial(requests: TicketIssueRequest[], actor: { id: string; name: string }): Promise<TicketIssueResult[]>;
  /** Hoeveel tickets een CZ-bedrijf in een seizoen al heeft (voor quota). */
  usageForCompany(commercialCompanyId: string, seasonId: string): Promise<{ issued: number; used: number }>;
}
