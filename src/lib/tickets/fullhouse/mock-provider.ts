import type { FullhouseEvent, FullhouseScanResult, FullhouseTicket, OfflineScan, TicketPage, TicketProvider } from "./types";

// Testprovider: voorspelbare voorbeelddata, geen netwerk. Standaard in ontwikkeling en
// previews. Barcodes: FH-TEST-0001 t/m FH-TEST-0050 zijn geldig, FH-TEST-INVALID is
// ongeldig, al het andere bestaat niet.

const EVENT: FullhouseEvent = { externalId: "mock-event-1", name: "Testwedstrijd (Fullhouse-testdata)", startsAt: null };

function ticket(n: number, status = "VALID"): FullhouseTicket {
  const code = n < 0 ? "FH-TEST-INVALID" : `FH-TEST-${String(n).padStart(4, "0")}`;
  return {
    externalId: `mock-ticket-${n}`,
    barcode: code,
    name: `Testbezoeker ${Math.abs(n)}`,
    ticketTypeId: "mock-type",
    ticketName: "Staanplaats (test)",
    categoryRef: null,
    eventId: EVENT.externalId,
    status,
    area: "Tribune",
    row: null,
    seat: null,
    updatedAt: null,
  };
}

const TICKETS = [...Array.from({ length: 50 }, (_, i) => ticket(i + 1)), ticket(-1, "INVALID")];

export function createMockProvider(): TicketProvider {
  const scanned = new Set<string>();
  return {
    mode: "mock",
    async listEvents() {
      return [EVENT];
    },
    async fetchTicketsPage(eventId, { top, skip }): Promise<TicketPage> {
      const all = eventId === EVENT.externalId ? TICKETS : [];
      return { tickets: all.slice(skip, skip + top), total: all.length };
    },
    async lookupBarcode(barcode) {
      return TICKETS.find((t) => t.barcode === barcode) ?? null;
    },
    async scanBarcode(barcode): Promise<FullhouseScanResult> {
      const t = TICKETS.find((x) => x.barcode === barcode) ?? null;
      if (!t || t.status !== "VALID" || scanned.has(barcode)) return { access: "DENIED", ticket: t };
      scanned.add(barcode);
      return { access: "GRANTED", ticket: t };
    },
    async pushOfflineScans(eventId: string, scans: OfflineScan[]) {
      void eventId;
      void scans;
    },
  };
}
