import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAudit } from "../audit.server";
import { need, type TicketsActor } from "../authz.server";
import { codeHash, initialsFromFullName } from "../scan.server";
import { fullhouseConfigured, ticketProvider } from "./index";
import { FullhouseError } from "./types";
import { catalogNameMap, nameKey, syncFullhouseCatalog } from "./catalog.server";
import { pickSeason, seasonMaintenance } from "../season-link.server";
import { needsSoldAtBackfill } from "../fullhouse-season.server";
import { QUIET_RUN, SCHEDULE_MINUTES, syncHealth } from "./health.server";

// Synchronisatie met Fullhouse (alleen lezen). Fullhouse blijft de bron: de Hub bewaart een
// lokale kopie (barcode alleen als hash, naam alleen als initialen) om te kunnen scannen.

const PAGE = 1000;
const DEADLINE_MS = 240_000;
const errMsg = (e: unknown) => (e instanceof FullhouseError ? e.message : e instanceof Error ? e.message : "Onbekende fout");

export async function fullhouseOverview(actor: TicketsActor) {
  need(actor, "sync:read");
  const [events, runs, counts, kinds, names] = await Promise.all([
    prisma.ticketEvent.findMany({ where: { source: "FULLHOUSE", archivedAt: null }, orderBy: { startsAt: "desc" }, take: 50 }),
    prisma.ticketSyncRun.findMany({ where: { NOT: QUIET_RUN }, orderBy: { startedAt: "desc" }, take: 30 }),
    prisma.ticketExternalTicket.groupBy({ by: ["eventExtId", "status"], _count: { _all: true } }),
    prisma.ticketExternalTicket.groupBy({ by: ["eventExtId", "ticketName", "categoryRef", "area"], where: { status: "VALID" }, _count: { _all: true } }),
    catalogNameMap(),
  ]);
  return {
    config: fullhouseConfigured(),
    provider: ticketProvider().mode,
    writesEnabled: process.env.FULLHOUSE_ALLOW_WRITES === "true",
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.startsAt,
      status: e.status,
      externalId: e.externalId,
      counts: Object.fromEntries(counts.filter((c) => c.eventExtId === e.externalId).map((c) => [c.status, c._count._all])),
      // Geldige tickets per kaarttype en zone/categorie zoals Fullhouse ze meegeeft.
      kinds: kinds
        .filter((k) => k.eventExtId === e.externalId)
        .map((k) => {
          const zone = k.area ?? k.categoryRef;
          return { type: k.ticketName, zone, hhcType: k.ticketName ? (names.type.get(nameKey(k.ticketName)) ?? null) : null, hhcZone: zone ? (names.zone.get(nameKey(zone)) ?? null) : null, count: k._count._all };
        })
        .sort((a, b) => b.count - a.count),
    })),
    runs,
    health: await syncHealth(),
    schedule: { minutes: SCHEDULE_MINUTES },
  };
}

/** Evenementen van Fullhouse in de Hub zetten (direct actief: Fullhouse verkoopt er al voor), samen met kaartsoorten en vakken. */
export async function importFullhouseEvents(actor: TicketsActor) {
  need(actor, "sync:manage");
  return importEventsAs({ id: actor.id, name: actor.name });
}

export async function importEventsAs(actor: { id: string | null; name: string }) {
  const run = await prisma.ticketSyncRun.create({ data: { kind: "events", status: "RUNNING", mode: ticketProvider().mode, startedBy: actor.name } });
  try {
    const list = await ticketProvider().listEvents();
    let created = 0;
    const seasons = await prisma.ticketSeason.findMany({ select: { id: true, startsOn: true, endsOn: true } });
    for (const e of list) {
      const exists = await prisma.ticketEvent.findUnique({ where: { externalId: e.externalId }, select: { id: true } });
      if (exists) continue;
      const startsAt = e.startsAt ?? new Date(Date.now() + 7 * 86_400_000);
      await prisma.ticketEvent.create({ data: { title: e.name.slice(0, 120), startsAt, endsAt: new Date(startsAt.getTime() + 6 * 3600_000), status: "ACTIVE", source: "FULLHOUSE", externalId: e.externalId, visible: false, seasonId: pickSeason(startsAt, seasons), allowReentry: true } });
      created++;
    }
    // Duels die eerder zonder seizoen binnenkwamen alsnog koppelen (seizoenskaarten gelden dan direct), en oude geldigheidstijden in Nederlandse tijd zetten.
    await seasonMaintenance();
    // Kaartsoorten en vakken meenemen; een fout daarin laat het ophalen van evenementen niet mislukken.
    let catalog: Awaited<ReturnType<typeof syncFullhouseCatalog>> | null = null;
    try {
      catalog = await syncFullhouseCatalog(actor, list);
    } catch (e) {
      console.error("[fullhouse] kaartsoorten en vakken bijwerken mislukt", errMsg(e));
    }
    await prisma.ticketSyncRun.update({ where: { id: run.id }, data: { status: "OK", fetched: list.length, upserted: created, finishedAt: new Date() } });
    await ticketAudit({ action: "sync.completed", actor: { id: actor.id, name: actor.name }, summary: "Fullhouse-evenementen opgehaald", meta: { fetched: list.length, created } });
    return { fetched: list.length, created, catalog };
  } catch (e) {
    await prisma.ticketSyncRun.update({ where: { id: run.id }, data: { status: "FAILED", error: errMsg(e).slice(0, 300), finishedAt: new Date() } });
    await ticketAudit({ action: "sync.failed", actor: { id: actor.id, name: actor.name }, summary: "Fullhouse-evenementen ophalen mislukt", reason: errMsg(e) });
    throw new ApiError(502, errMsg(e));
  }
}

/** Tickets van één Fullhouse-evenement ophalen: volledig, of alleen wat sinds de vorige geslaagde synchronisatie wijzigde. */
export async function syncEventTickets(who: { id: string | null; name: string }, eventExtId: string, opts: { full?: boolean; quiet?: boolean } = {}) {
  const provider = ticketProvider();
  const last = opts.full || (await needsSoldAtBackfill(eventExtId)) ? null : await prisma.ticketSyncRun.findFirst({ where: { kind: "tickets", eventExtId, status: "OK" }, orderBy: { startedAt: "desc" } });
  const full = !last;
  const from = last ? new Date(last.startedAt.getTime() - 5 * 60_000) : undefined;
  const run = await prisma.ticketSyncRun.create({ data: { kind: "tickets", eventExtId, status: "RUNNING", mode: provider.mode, startedBy: who.name } });
  const started = Date.now();
  try {
    let skip = 0;
    let fetched = 0;
    let upserted = 0;
    let total = Infinity;
    while (skip < total) {
      if (Date.now() - started > DEADLINE_MS) throw new FullhouseError("Synchronisatie afgebroken: te lang bezig (volgende keer verder).", "timeout");
      const page = await provider.fetchTicketsPage(eventExtId, { top: PAGE, skip, from });
      total = page.total;
      fetched += page.tickets.length;
      const now = new Date();
      for (let i = 0; i < page.tickets.length; i += 100) {
        await prisma.$transaction(
          page.tickets.slice(i, i + 100).map((t) => {
            const data = { codeHash: codeHash(t.barcode), status: String(t.status), ticketName: t.ticketName, ticketTypeId: t.ticketTypeId, categoryRef: t.categoryRef, area: t.area, holderLabel: t.name ? initialsFromFullName(t.name) : null, syncedAt: now, ...(t.soldAt ? { soldAt: t.soldAt } : {}) };
            return prisma.ticketExternalTicket.upsert({ where: { eventExtId_externalId: { eventExtId: t.eventId || eventExtId, externalId: t.externalId } }, create: { eventExtId: t.eventId || eventExtId, externalId: t.externalId, ...data }, update: data });
          }),
        );
        upserted += Math.min(100, page.tickets.length - i);
      }
      if (page.tickets.length === 0) break;
      skip += page.tickets.length;
    }
    // Alleen na een volledige, complete synchronisatie: tickets die Fullhouse niet meer kent, worden ongeldig.
    let removed = 0;
    if (full && fetched >= total) removed = (await prisma.ticketExternalTicket.updateMany({ where: { eventExtId, syncedAt: { lt: run.startedAt }, status: { not: "INVALID" } }, data: { status: "INVALID" } })).count;
    await prisma.ticketSyncRun.update({ where: { id: run.id }, data: { status: "OK", fetched, upserted, finishedAt: new Date() } });
    // Automatische synchronisaties zonder wijzigingen komen niet in het auditlog (anders elke 5 minuten een regel per wedstrijd).
    if (!opts.quiet || fetched > 0 || removed > 0) await ticketAudit({ action: "sync.completed", actor: { id: who.id, name: who.name }, summary: `Fullhouse-tickets gesynchroniseerd (${full ? "volledig" : "wijzigingen"})`, meta: { eventExtId, fetched, upserted, removed } });
    return { fetched, upserted, removed, full };
  } catch (e) {
    await prisma.ticketSyncRun.update({ where: { id: run.id }, data: { status: "FAILED", error: errMsg(e).slice(0, 300), finishedAt: new Date() } });
    // Bij automatische synchronisaties alleen de eerste fout van een reeks vastleggen.
    const previous = opts.quiet ? await prisma.ticketSyncRun.findFirst({ where: { kind: "tickets", eventExtId, id: { not: run.id }, status: { not: "RUNNING" } }, orderBy: { startedAt: "desc" }, select: { status: true } }) : null;
    if (previous?.status !== "FAILED") await ticketAudit({ action: "sync.failed", actor: { id: who.id, name: who.name }, summary: "Fullhouse-tickets synchroniseren mislukt", reason: errMsg(e), meta: { eventExtId } });
    throw e;
  }
}

export async function syncEventAction(actor: TicketsActor, eventId: string, full: boolean) {
  need(actor, "sync:manage");
  const ev = await prisma.ticketEvent.findUnique({ where: { id: eventId }, select: { externalId: true } });
  if (!ev?.externalId) throw new ApiError(400, "Deze wedstrijd heeft geen Fullhouse-koppeling.");
  try {
    return await syncEventTickets({ id: actor.id, name: actor.name }, ev.externalId, { full });
  } catch (e) {
    throw new ApiError(502, errMsg(e));
  }
}

/** Alleen lezen: welke velden geeft Fullhouse terug? Toont veldnamen, nooit waarden of barcodes. */
export async function diagnoseFullhouse(actor: TicketsActor) {
  need(actor, "sync:manage");
  const provider = ticketProvider();
  const out: { mode: string; events: number | null; ticketKeys: string[]; note: string } = { mode: provider.mode, events: null, ticketKeys: [], note: "" };
  if (provider.mode === "mock") out.note = "Testmodus: er is geen echte koppeling. Zet FULLHOUSE_MODE en FULLHOUSE_API_KEY in Vercel.";
  // Bij een API-sleutel: eerst controleren welke inlogvorm Fullhouse accepteert (alleen statuscodes, geen waarden).
  const key = process.env.FULLHOUSE_API_KEY;
  if (provider.mode !== "mock" && key) {
    const base = fullhouseConfigured().baseUrl;
    const tries: [string, Record<string, string>][] = [
      ["Authorization: Bearer", { Authorization: `Bearer ${key}` }],
      ["Authorization (alleen sleutel)", { Authorization: key }],
      ["x-api-key", { "x-api-key": key }],
    ];
    const seen: string[] = [];
    for (const [label, headers] of tries) {
      try {
        const r = await fetch(`${base}/events?top=1&skip=0`, { headers: { ...headers, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
        seen.push(`${label}: ${r.status}`);
      } catch {
        seen.push(`${label}: niet bereikbaar`);
      }
    }
    out.note = `Inlogvormen getest op ${base}/events — ${seen.join(" · ")}`;
  }
  try {
    const events = await provider.listEvents();
    out.events = events.length;
    // Per evenement hoeveel tickets Fullhouse teruggeeft (eerste pagina), zodat zichtbaar is waar de tickets staan.
    const lines: string[] = [];
    for (const ev of events.slice(0, 30)) {
      try {
        const page = await provider.fetchTicketsPage(ev.externalId, { top: 100, skip: 0 });
        lines.push(`${ev.name.slice(0, 40)}: ${page.tickets.length}${page.total > page.tickets.length ? "+" : ""}`);
        if (!out.ticketKeys.length && page.tickets[0]) out.ticketKeys = Object.entries(page.tickets[0]).filter(([, v]) => v !== null).map(([k]) => k);
      } catch (e) {
        lines.push(`${ev.name.slice(0, 40)}: fout (${errMsg(e)})`);
      }
    }
    if (lines.length) out.note = `${out.note ? out.note + " — " : ""}Tickets per evenement: ${lines.join(" · ")}`;
  } catch (e) {
    throw new ApiError(502, out.note ? `${errMsg(e)} ${out.note}` : errMsg(e));
  }
  return out;
}

/** Voor de dagelijkse cron: volledige ronde (evenementen + alle wedstrijden in beeld), zonder minimale tussentijd. */
export async function syncUpcoming() {
  const { runAutoSync } = await import("./auto-sync.server");
  return runAutoSync({ trigger: "cron" });
}
