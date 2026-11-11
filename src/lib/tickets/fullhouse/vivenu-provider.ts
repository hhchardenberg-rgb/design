import { FullhouseError, type FullhouseEvent, type FullhouseMode, type FullhouseScanResult, type FullhouseTicket, type OfflineScan, type TicketPage, type TicketProvider } from "./types";

// Echte Fullhouse-provider (Fullhouse draait op vivenu; endpoints uit docs.vivenu.dev, zie
// docs/hhc-tickets/architectuur.md §2). Uitgangspunten:
//  - Alleen LEZEN. Inchecken bij Fullhouse en offline scans terugmelden zijn schrijfacties en
//    staan uit, tenzij FULLHOUSE_ALLOW_WRITES=true (bewust apart te zetten).
//  - Faalt veilig: een antwoord dat niet de verwachte velden heeft geeft `bad_response`, nooit
//    een gok. De veldnamen van de antwoorden zijn nog niet tegen een echt account gecontroleerd;
//    de knop "Controleer koppeling" op de synchronisatiepagina toont welke velden Fullhouse
//    teruggeeft, zonder waarden.

export interface VivenuConfig {
  mode: FullhouseMode;
  baseUrl: string;
  accessToken: string;
  allowWrites: boolean;
  fetchImpl?: typeof fetch;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function mapTicket(raw: unknown, fallbackEventId: string): FullhouseTicket {
  if (!isObj(raw)) throw new FullhouseError("Onverwacht ticketformaat van Fullhouse.", "bad_response");
  const externalId = str(raw._id) ?? str(raw.id);
  const barcode = str(raw.barcode);
  const status = str(raw.status);
  if (!externalId || !barcode || !status) throw new FullhouseError("Een Fullhouse-ticket mist _id, barcode of status.", "bad_response");
  const updated = str(raw.updatedAt);
  return {
    externalId,
    barcode,
    name: str(raw.name),
    ticketTypeId: str(raw.ticketTypeId),
    ticketName: str(raw.ticketName),
    categoryRef: str(raw.categoryRef),
    eventId: str(raw.eventId) ?? fallbackEventId,
    status,
    area: str(raw.area),
    row: str(raw.row),
    seat: str(raw.seat),
    updatedAt: updated ? new Date(updated) : null,
  };
}

function docsOf(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (isObj(body) && Array.isArray(body.docs)) return body.docs;
  throw new FullhouseError("Onverwacht antwoord van Fullhouse (geen lijst).", "bad_response");
}

export function createVivenuProvider(cfg: VivenuConfig): TicketProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  async function get(path: string, allow404 = false): Promise<unknown> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12_000);
    let res: Response;
    try {
      res = await doFetch(`${cfg.baseUrl}${path}`, { headers: { token: cfg.accessToken, Accept: "application/json" }, signal: ctl.signal, cache: "no-store" });
    } catch (e) {
      throw new FullhouseError(e instanceof Error && e.name === "AbortError" ? "Fullhouse reageert niet op tijd." : "Fullhouse is niet bereikbaar.", e instanceof Error && e.name === "AbortError" ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 404 && allow404) return null;
    if (res.status === 401 || res.status === 403) throw new FullhouseError("Fullhouse weigert het token van het scanapparaat.", "auth", res.status);
    if (res.status === 404) throw new FullhouseError("Niet gevonden bij Fullhouse.", "not_found", 404);
    if (res.status === 429) throw new FullhouseError("Fullhouse vraagt om te vertragen (te veel verzoeken).", "rate_limited", 429);
    if (!res.ok) throw new FullhouseError(`Fullhouse gaf een fout (${res.status}).`, res.status >= 500 ? "network" : "bad_response", res.status);
    try {
      return await res.json();
    } catch {
      throw new FullhouseError("Fullhouse gaf geen geldig antwoord.", "bad_response");
    }
  }
  const writesOff = () => new FullhouseError("Schrijven naar Fullhouse staat uit (FULLHOUSE_ALLOW_WRITES). De Hub registreert deze scan zelf.", "config");

  return {
    mode: cfg.mode,
    async listEvents(): Promise<FullhouseEvent[]> {
      return docsOf(await get("/accessusers/events")).map((e) => {
        if (!isObj(e)) throw new FullhouseError("Onverwacht evenementformaat van Fullhouse.", "bad_response");
        const externalId = str(e._id) ?? str(e.id);
        const name = str(e.name);
        if (!externalId || !name) throw new FullhouseError("Een Fullhouse-evenement mist _id of name.", "bad_response");
        const start = str(e.start) ?? str(e.startDate);
        return { externalId, name, startsAt: start && !Number.isNaN(Date.parse(start)) ? new Date(start) : null };
      });
    },
    async fetchTicketsPage(eventId, { top, skip, from, until }): Promise<TicketPage> {
      const q = new URLSearchParams({ top: String(Math.min(1000, Math.max(1, top))), skip: String(skip) });
      if (from) q.set("from", from.toISOString());
      if (until) q.set("until", until.toISOString());
      const body = await get(`/accessusers/tickets/v2/${encodeURIComponent(eventId)}?${q}`);
      const tickets = docsOf(body).map((t) => mapTicket(t, eventId));
      const total = isObj(body) && typeof body.total === "number" ? body.total : skip + tickets.length;
      return { tickets, total };
    },
    async lookupBarcode(barcode, eventId) {
      const q = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
      const body = await get(`/accessusers/tickets/${encodeURIComponent(barcode)}${q}`, true);
      if (body === null) return null;
      return mapTicket(isObj(body) && isObj(body.ticket) ? body.ticket : body, eventId ?? "");
    },
    async scanBarcode(): Promise<FullhouseScanResult> {
      if (!cfg.allowWrites) throw writesOff();
      throw new FullhouseError("Inchecken bij Fullhouse is nog niet aangesloten.", "config");
    },
    async pushOfflineScans(_eventId: string, _scans: OfflineScan[]): Promise<void> {
      if (!cfg.allowWrites) throw writesOff();
      throw new FullhouseError("Terugmelden aan Fullhouse is nog niet aangesloten.", "config");
    },
  };
}
