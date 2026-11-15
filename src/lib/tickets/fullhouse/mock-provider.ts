import type { FullhouseHolderTicket, FullhouseSearchKind, FullhouseSearchResult, FullhouseEvent, FullhouseScanResult, FullhouseTicket, OfflineScan, TicketPage, TicketProvider } from "./types";

// Testprovider: voorspelbare voorbeelddata, geen netwerk. Standaard in ontwikkeling en
// previews. Barcodes: FH-TEST-0001 t/m FH-TEST-0050 zijn geldig, FH-TEST-INVALID is
// ongeldig, al het andere bestaat niet.

const EVENT: FullhouseEvent = {
  externalId: "mock-event-1",
  name: "Testwedstrijd (Fullhouse-testdata)",
  startsAt: null,
  ticketTypes: [
    { externalId: "mock-type", name: "Staanplaats (test)", price: 12.5, categoryRef: "mock-cat-tribune", active: true },
    { externalId: "mock-type-kind", name: "Kind t/m 12 jaar (test)", price: 5, categoryRef: "mock-cat-tribune", active: true },
    { externalId: "mock-type-vip", name: "Business seat (test)", price: 45, categoryRef: "mock-cat-vip", active: true },
  ],
  categories: [
    { ref: "mock-cat-tribune", name: "Tribune" },
    { ref: "mock-cat-vip", name: "Businessruimte" },
  ],
};

function ticket(n: number, status = "VALID"): FullhouseTicket {
  const code = n < 0 ? "FH-TEST-INVALID" : `FH-TEST-${String(n).padStart(4, "0")}`;
  return {
    externalId: `mock-ticket-${n}`,
    barcode: code,
    name: `Testbezoeker ${Math.abs(n)}`,
    ticketTypeId: "mock-type",
    ticketName: "Staanplaats (test)",
    categoryRef: "mock-cat-tribune",
    eventId: EVENT.externalId,
    status,
    area: "Tribune",
    row: null,
    seat: null,
    updatedAt: null,
  };
}

const TICKETS = [...Array.from({ length: 50 }, (_, i) => ticket(i + 1)), ticket(-1, "INVALID")];

/** Testkopers voor de zoektool: twee tickets per bestelling, bezoeker n heeft testbezoeker<n>@voorbeeld.nl. */
function holder(t: FullhouseTicket, i: number): FullhouseHolderTicket {
  const n = i + 1;
  const order = Math.ceil(n / 2);
  return { ...t, email: `testbezoeker${Math.abs(n)}@voorbeeld.nl`, customerId: `mock-customer-${order}`, transactionId: `mock-order-${order}`, createdAt: new Date(Date.UTC(2026, 7, 1 + (n % 28), 10)) };
}
const HOLDERS = TICKETS.map(holder);

export function mockSearch(kind: FullhouseSearchKind, term: string): FullhouseSearchResult {
  const t = term.trim().toLowerCase();
  const hit = HOLDERS.filter((h) =>
    kind === "ticket" ? h.barcode.toLowerCase() === t : kind === "order" ? h.transactionId === term.trim() : kind === "email" ? h.email === t : (h.name ?? "").toLowerCase().includes(t),
  );
  return { tickets: hit.slice(0, 50), truncated: hit.length > 50 };
}

export function createMockProvider(): TicketProvider {
  const scanned = new Set<string>();
  return {
    mode: "mock",
    async searchHolders(kind, term) {
      return mockSearch(kind, term);
    },
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
