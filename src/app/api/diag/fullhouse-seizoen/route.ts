import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

// TIJDELIJKE, ALLEEN-LEZEN diagnose (alleen in een Vercel-preview): hoe staan seizoenskaarten in Fullhouse (vivenu)?
// Doet uitsluitend GET-verzoeken. Geeft geen namen, e-mailadressen of barcodes terug: alleen de vorm van
// evenementen (type, hoofd-/subevenement), kaartsoortnamen, aantallen en of dezelfde (gehashte) barcode bij
// meerdere duels voorkomt. Wordt verwijderd zodra de vorm bekend is.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TOKEN_SHA256 = "26c9eac18ca62e6d50fb07fce7432af90e1b8fe7e38eeb56ee870e0d5379f41f";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const s = (v: unknown) => (typeof v === "string" ? v : null);
const docs = (b: unknown): Obj[] => (Array.isArray(b) ? b.filter(isObj) : isObj(b) && Array.isArray(b.docs) ? b.docs.filter(isObj) : isObj(b) && Array.isArray(b.rows) ? b.rows.filter(isObj) : []);
const h = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 8);
const count = (xs: (string | null)[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x ?? "(leeg)"] = (m[x ?? "(leeg)"] ?? 0) + 1), m), {});

function authorized(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const a = Buffer.from(createHash("sha256").update(t).digest("hex"));
  const b = Buffer.from(TOKEN_SHA256);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (process.env.VERCEL_ENV !== "preview" || !authorized(req)) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  const key = process.env.FULLHOUSE_API_KEY;
  if (!key) return NextResponse.json({ error: "Geen FULLHOUSE_API_KEY in deze omgeving." });
  const base = process.env.FULLHOUSE_API_BASE || "https://vivenu.com/api";
  const get = async (path: string) => {
    const r = await fetch(`${base}${path}`, { method: "GET", headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, cache: "no-store" });
    if (!r.ok) return { __status: r.status };
    return r.json();
  };

  const events: Obj[] = [];
  const first = await get(`/events?top=100&skip=0`);
  const probe = {
    eventsResponse: isObj(first) ? ("__status" in first ? { httpStatus: first.__status } : { keys: Object.keys(first), total: first.total ?? null }) : Array.isArray(first) ? { array: first.length } : typeof first,
  };
  for (let skip = 0; skip < 1000; skip += 100) {
    const rows = docs(skip === 0 ? first : await get(`/events?top=100&skip=${skip}`));
    events.push(...rows);
    if (rows.length < 100) break;
  }
  const evOut = events.map((e) => ({
    id: s(e._id),
    name: s(e.name),
    start: s(e.start) ?? s(e.startDate),
    eventType: s(e.eventType),
    rootId: s(e.rootId),
    childEvents: Array.isArray(e.childEvents) ? e.childEvents.length : null,
    ticketTypes: Array.isArray(e.tickets) ? e.tickets.filter(isObj).map((t) => s(t.name)) : [],
    fieldsAboutSeason: Object.keys(e).filter((k) => /season|root|child|group|parent|series|package|subscription/i.test(k)),
  }));

  // Tickets van de hoofd-/groepsevenementen en van de laatste/komende subevenementen (max. 8 evenementen, max. 500 tickets elk).
  const roots = events.filter((e) => (Array.isArray(e.childEvents) && e.childEvents.length > 0) || /ROOT|GROUP|RECUR/i.test(s(e.eventType) ?? ""));
  const children = events.filter((e) => s(e.rootId)).sort((a, b) => String(s(b.start) ?? "").localeCompare(String(s(a.start) ?? ""))).slice(0, 5);
  const sample = [...roots.slice(0, 3), ...children].slice(0, 8);
  const barcodeEvents = new Map<string, Set<string>>();
  const perEvent = [];
  for (const e of sample) {
    const id = s(e._id)!;
    const tickets: Obj[] = [];
    let status: unknown = null;
    for (let skip = 0; skip < 500; skip += 100) {
      const body = await get(`/tickets?${new URLSearchParams({ event: id, top: "100", skip: String(skip) })}`);
      if (isObj(body) && "__status" in body) {
        status = body.__status;
        break;
      }
      const rows = docs(body);
      tickets.push(...rows);
      if (rows.length < 100) break;
    }
    for (const t of tickets) {
      const bc = s(t.barcode);
      if (bc) (barcodeEvents.get(h(bc)) ?? barcodeEvents.set(h(bc), new Set()).get(h(bc))!).add(id);
    }
    perEvent.push({
      event: s(e.name),
      eventType: s(e.eventType),
      isRoot: roots.includes(e),
      httpError: status,
      tickets: tickets.length,
      byTicketName: count(tickets.map((t) => s(t.ticketName))),
      byType: count(tickets.map((t) => s(t.type))),
      byOrigin: count(tickets.map((t) => s(t.origin))),
      byStatus: count(tickets.map((t) => s(t.status))),
      withRootEventId: tickets.filter((t) => s(t.rootEventId)).length,
      rootEventIdEqualsEvent: tickets.filter((t) => s(t.rootEventId) && s(t.rootEventId) === s(t.eventId)).length,
      withPackageInfo: tickets.filter((t) => isObj(t.packageInfo)).length,
      withOriginTicketId: tickets.filter((t) => s(t.originTicketId)).length,
      withExcludedEventIds: tickets.filter((t) => Array.isArray(t.excludedEventIds) && t.excludedEventIds.length > 0).length,
      ticketFieldNames: [...new Set(tickets.flatMap((t) => Object.keys(t)))].sort(),
    });
  }
  const multi = [...barcodeEvents.values()].filter((x) => x.size > 1).length;
  return NextResponse.json({
    probe,
    totalEvents: events.length,
    eventTypes: count(events.map((e) => s(e.eventType))),
    events: evOut,
    sampledEvents: perEvent,
    barcodes: { distinct: barcodeEvents.size, appearingInMoreThanOneSampledEvent: multi },
  });
}
