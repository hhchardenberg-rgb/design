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
  /** Token van een access user (scanapparaat). Wordt gebruikt als er geen apiKey is. */
  accessToken?: string;
  /** API-sleutel (alleen lezen): gebruikt de gewone ticket- en evenementenlijsten met Bearer-authenticatie. */
  apiKey?: string;
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
  if (isObj(body) && Array.isArray(body.rows)) return body.rows;
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
      res = await doFetch(`${cfg.baseUrl}${path}`, { headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}`, Accept: "application/json" } : { token: cfg.accessToken ?? "", Accept: "application/json" }, signal: ctl.signal, cache: "no-store" });
    } catch (e) {
      throw new FullhouseError(e instanceof Error && e.name === "AbortError" ? "Fullhouse reageert niet op tijd." : "Fullhouse is niet bereikbaar.", e instanceof Error && e.name === "AbortError" ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 404 && allow404) return null;
    if (res.status === 401 || res.status === 403) throw new FullhouseError(`Fullhouse weigert ${cfg.apiKey ? "de API-sleutel" : "het token van het scanapparaat"} (${res.status}).`, "auth", res.status);
    if (res.status === 404) throw new FullhouseError("Niet gevonden bij Fullhouse.", "not_found", 404);
    if (res.status === 429) throw new FullhouseError("Fullhouse vraagt om te vertragen (te veel verzoeken).", "rate_limited", 429);
    if (!res.ok) throw new FullhouseError(`Fullhouse gaf een fout (${res.status}).`, res.status >= 500 ? "network" : "bad_response", res.status);
    try {
      return await res.json();
    } catch {
      throw new FullhouseError("Fullhouse gaf geen geldig antwoord.", "bad_response");
    }
  }
  /** Gewone evenementenlijst (API-sleutel): top en skip zijn verplicht; alle pagina's samenvoegen. */
  async function listAllEvents(): Promise<unknown[]> {
    const all: unknown[] = [];
    for (let skip = 0; skip < 5000; skip += 100) {
      const rows = docsOf(await get(`/events?top=100&skip=${skip}`));
      all.push(...rows);
      if (rows.length < 100) break;
    }
    return all;
  }
  const writesOff = () => new FullhouseError("Schrijven naar Fullhouse staat uit (FULLHOUSE_ALLOW_WRITES). De Hub registreert deze scan zelf.", "config");

  return {
    mode: cfg.mode,
    async listEvents(): Promise<FullhouseEvent[]> {
      const raw = cfg.apiKey ? await listAllEvents() : await get("/accessusers/events");
      return docsOf(raw).map((e) => {
        if (!isObj(e)) throw new FullhouseError("Onverwacht evenementformaat van Fullhouse.", "bad_response");
        const externalId = str(e._id) ?? str(e.id);
        const name = str(e.name);
        if (!externalId || !name) throw new FullhouseError("Een Fullhouse-evenement mist _id of name.", "bad_response");
        const start = str(e.start) ?? str(e.startDate);
        return { externalId, name, startsAt: start && !Number.isNaN(Date.parse(start)) ? new Date(start) : null };
      });
    },
    async fetchTicketsPage(eventId, { top, skip, from, until }): Promise<TicketPage> {
      const size = Math.min(1000, Math.max(1, top));
      if (cfg.apiKey) {
        // Gewone ticketlijst: altijd compleet (het filter op wijzigingsdatum is niet nodig bij deze aantallen).
        const body = await get(`/tickets?${new URLSearchParams({ event: eventId, top: String(size), skip: String(skip) })}`);
        const rows = docsOf(body).map((t) => mapTicket(t, eventId));
        const total = isObj(body) && typeof body.total === "number" ? body.total : rows.length < size ? skip + rows.length : skip + rows.length + 1;
        return { tickets: rows, total };
      }
      const q = new URLSearchParams({ top: String(size), skip: String(skip) });
      if (from) q.set("from", from.toISOString());
      if (until) q.set("until", until.toISOString());
      const body = await get(`/accessusers/tickets/v2/${encodeURIComponent(eventId)}?${q}`);
      const tickets = docsOf(body).map((t) => mapTicket(t, eventId));
      const total = isObj(body) && typeof body.total === "number" ? body.total : skip + tickets.length;
      return { tickets, total };
    },
    async lookupBarcode(barcode, eventId) {
      if (cfg.apiKey) {
        const body = await get(`/tickets?${new URLSearchParams({ barcode, top: "5", skip: "0", ...(eventId ? { event: eventId } : {}) })}`);
        const rows = docsOf(body);
        return rows.length === 0 ? null : mapTicket(rows[0], eventId ?? "");
      }
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
