import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAudit } from "../audit.server";
import { need, type TicketsActor } from "../authz.server";
import { codeHash, initialsFromFullName } from "../scan.server";
import { fullhouseConfigured, ticketProvider } from "./index";
import { FullhouseError } from "./types";

// Synchronisatie met Fullhouse (alleen lezen). Fullhouse blijft de bron: de Hub bewaart een
// lokale kopie (barcode alleen als hash, naam alleen als initialen) om te kunnen scannen.

const PAGE = 1000;
const DEADLINE_MS = 240_000;
const errMsg = (e: unknown) => (e instanceof FullhouseError ? e.message : e instanceof Error ? e.message : "Onbekende fout");

export async function fullhouseOverview(actor: TicketsActor) {
  need(actor, "sync:read");
  const [events, runs, counts] = await Promise.all([
    prisma.ticketEvent.findMany({ where: { source: "FULLHOUSE" }, orderBy: { startsAt: "desc" }, take: 50 }),
    prisma.ticketSyncRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
    prisma.ticketExternalTicket.groupBy({ by: ["eventExtId", "status"], _count: { _all: true } }),
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
    })),
    runs,
  };
}

/** Evenementen van Fullhouse als concept in de Hub zetten; een beheerder activeert ze zelf. */
export async function importFullhouseEvents(actor: TicketsActor) {
  need(actor, "sync:manage");
  const run = await prisma.ticketSyncRun.create({ data: { kind: "events", status: "RUNNING", mode: ticketProvider().mode, startedBy: actor.name } });
  try {
    const list = await ticketProvider().listEvents();
    let created = 0;
    for (const e of list) {
      const exists = await prisma.ticketEvent.findUnique({ where: { externalId: e.externalId }, select: { id: true } });
      if (exists) continue;
      const startsAt = e.startsAt ?? new Date(Date.now() + 7 * 86_400_000);
      await prisma.ticketEvent.create({ data: { title: e.name.slice(0, 120), startsAt, endsAt: new Date(startsAt.getTime() + 6 * 3600_000), status: "DRAFT", source: "FULLHOUSE", externalId: e.externalId, visible: false } });
      created++;
    }
    await prisma.ticketSyncRun.update({ where: { id: run.id }, data: { status: "OK", fetched: list.length, upserted: created, finishedAt: new Date() } });
    await ticketAudit({ action: "sync.completed", actor: { id: actor.id, name: actor.name }, summary: "Fullhouse-evenementen opgehaald", meta: { fetched: list.length, created } });
    return { fetched: list.length, created };
  } catch (e) {
    await prisma.ticketSyncRun.update({ where: { id: run.id }, data: { status: "FAILED", error: errMsg(e).slice(0, 300), finishedAt: new Date() } });
    await ticketAudit({ action: "sync.failed", actor: { id: actor.id, name: actor.name }, summary: "Fullhouse-evenementen ophalen mislukt", reason: errMsg(e) });
    throw new ApiError(502, errMsg(e));
  }
}

/** Tickets van één Fullhouse-evenement ophalen: volledig, of alleen wat sinds de vorige geslaagde synchronisatie wijzigde. */
export async function syncEventTickets(who: { id: string | null; name: string }, eventExtId: string, opts: { full?: boolean } = {}) {
  const provider = ticketProvider();
  const last = opts.full ? null : await prisma.ticketSyncRun.findFirst({ where: { kind: "tickets", eventExtId, status: "OK" }, orderBy: { startedAt: "desc" } });
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
            const data = { codeHash: codeHash(t.barcode), status: String(t.status), ticketName: t.ticketName, area: t.area, holderLabel: t.name ? initialsFromFullName(t.name) : null, syncedAt: now };
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
    await ticketAudit({ action: "sync.completed", actor: { id: who.id, name: who.name }, summary: `Fullhouse-tickets gesynchroniseerd (${full ? "volledig" : "wijzigingen"})`, meta: { eventExtId, fetched, upserted, removed } });
    return { fetched, upserted, removed, full };
  } catch (e) {
    await prisma.ticketSyncRun.update({ where: { id: run.id }, data: { status: "FAILED", error: errMsg(e).slice(0, 300), finishedAt: new Date() } });
    await ticketAudit({ action: "sync.failed", actor: { id: who.id, name: who.name }, summary: "Fullhouse-tickets synchroniseren mislukt", reason: errMsg(e), meta: { eventExtId } });
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
  if (provider.mode === "mock") out.note = "Testmodus: er is geen echte koppeling. Zet FULLHOUSE_MODE en FULLHOUSE_ACCESS_TOKEN in Vercel.";
  try {
    const events = await provider.listEvents();
    out.events = events.length;
    if (events[0]) {
      const page = await provider.fetchTicketsPage(events[0].externalId, { top: 1, skip: 0 });
      out.ticketKeys = page.tickets[0] ? Object.entries(page.tickets[0]).filter(([, v]) => v !== null).map(([k]) => k) : [];
    }
  } catch (e) {
    throw new ApiError(502, errMsg(e));
  }
  return out;
}

/** Voor de cron: alle Fullhouse-evenementen van de komende week en recent, stil bij fouten per evenement. */
export async function syncUpcoming() {
  if (ticketProvider().mode === "mock") return { skipped: "testmodus" };
  const events = await prisma.ticketEvent.findMany({
    where: { source: "FULLHOUSE", externalId: { not: null }, visible: true, status: "ACTIVE", startsAt: { lte: new Date(Date.now() + 7 * 86_400_000) }, endsAt: { gte: new Date(Date.now() - 86_400_000) } },
    select: { externalId: true },
  });
  const results: { ok: number; failed: number } = { ok: 0, failed: 0 };
  for (const e of events) {
    try {
      await syncEventTickets({ id: null, name: "Automatisch" }, e.externalId!);
      results.ok++;
    } catch {
      results.failed++;
    }
  }
  return results;
}
