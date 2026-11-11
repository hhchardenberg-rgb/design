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
}
