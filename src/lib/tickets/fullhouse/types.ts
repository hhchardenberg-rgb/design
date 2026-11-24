// Fullhouse-integratielaag. Fullhouse draait op het vivenu-platform; alle velden en
// endpoints in de echte provider komen uit de officiële documentatie (docs.vivenu.dev,
// zie docs/hhc-tickets/architectuur.md §2). Niets hier wordt rechtstreeks door de
// frontend gebruikt: alleen eigen server-API's praten met deze laag.

export type FullhouseMode = "mock" | "sandbox" | "production";

/** Ticketstatus zoals vivenu die geeft. Alleen VALID geeft toegang. */
export type FullhouseTicketStatus = "VALID" | "INVALID" | "RESERVED" | "DETAILSREQUIRED" | "BLANK";

export interface FullhouseEvent {
  externalId: string;
  name: string;
  startsAt: Date | null;
  /** Kaartsoorten van dit evenement (vivenu `tickets[]`), als Fullhouse die meegeeft. */
  ticketTypes?: FullhouseTicketType[];
  /** Ticketcategorieën / toegangsvakken van dit evenement (vivenu `categories[]`). */
  categories?: FullhouseCategory[];
}

export interface FullhouseTicketType {
  externalId: string;
  name: string;
  price: number | null;
  categoryRef: string | null;
  active: boolean;
}

export interface FullhouseCategory {
  /** De `ref` waarmee kaartsoorten (`categoryRef`) naar deze categorie verwijzen; anders het _id. */
  ref: string;
  name: string;
}

export interface FullhouseTicket {
  externalId: string;
  barcode: string;
  name: string | null;
  ticketTypeId: string | null;
  ticketName: string | null;
  categoryRef: string | null;
  eventId: string;
  status: FullhouseTicketStatus | string;
  area: string | null;
  row: string | null;
  seat: string | null;
  updatedAt: Date | null;
  /** Verkoopmoment (vivenu createdAt), als Fullhouse dat meegeeft. */
  soldAt?: Date | null;
}

export interface FullhouseScanResult {
  /** GRANTED is de enige gedocumenteerde waarde voor toegang; al het andere = weigeren. */
  access: "GRANTED" | string;
  ticket: FullhouseTicket | null;
}

export interface OfflineScan {
  ticketId?: string | null;
  barcode: string;
  scannedAt: Date;
  ok: boolean;
  direction: "IN" | "OUT";
}

export interface TicketPage {
  tickets: FullhouseTicket[];
  total: number;
}

export class FullhouseError extends Error {
  constructor(
    message: string,
    public readonly kind: "timeout" | "network" | "auth" | "not_found" | "rate_limited" | "bad_response" | "config",
    public readonly status?: number,
  ) {
    super(message);
  }
}

/** Een Fullhouse-ticket met de gegevens van de koper/houder, alleen voor de zoektool in Klantenservice. Wordt nooit opgeslagen. */
export interface FullhouseHolderTicket extends FullhouseTicket {
  email: string | null;
  customerId: string | null;
  transactionId: string | null;
  createdAt: Date | null;
}

export type FullhouseSearchKind = "name" | "email" | "ticket" | "order";

export interface FullhouseSearchResult {
  tickets: FullhouseHolderTicket[];
  /** Meer gevonden dan getoond. */
  truncated: boolean;
}

export interface TicketProvider {
  readonly mode: FullhouseMode;
  /** Evenementen waartoe het scanapparaat (access user) toegang heeft. */
  listEvents(): Promise<FullhouseEvent[]>;
  /** Eén pagina tickets voor de offline-cache; `from` voor alleen gewijzigde tickets. */
  fetchTicketsPage(eventId: string, opts: { top: number; skip: number; from?: Date; until?: Date }): Promise<TicketPage>;
  /** Realtime opzoeken zonder in te checken. null = bestaat niet. */
  lookupBarcode(barcode: string, eventId?: string): Promise<FullhouseTicket | null>;
  /** Realtime inchecken. */
  scanBarcode(barcode: string): Promise<FullhouseScanResult>;
  /** Offline gemaakte scans achteraf terugmelden. */
  pushOfflineScans(eventId: string, scans: OfflineScan[]): Promise<void>;
  /**
   * Alleen lezen: tickets zoeken op naam, e-mailadres, barcode of ordernummer (vivenu-transactie).
   * Ontbreekt als de koppeling dat niet kan (alleen een scanapparaat-token: dan kan alleen op barcode).
   */
  searchHolders?(kind: FullhouseSearchKind, term: string): Promise<FullhouseSearchResult>;
}
