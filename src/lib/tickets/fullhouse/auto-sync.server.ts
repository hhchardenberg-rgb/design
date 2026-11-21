import { prisma } from "@/lib/prisma";
import { ticketAudit } from "../audit.server";
import { ticketProvider } from "./index";
import { FullhouseError } from "./types";
import { importEventsAs, syncEventTickets } from "./sync.server";
import { AUTO_NAMES } from "./health.server";

// Automatische synchronisatie met Fullhouse (alleen lezen). Eén "ronde" haalt per wedstrijd in beeld
// alleen de wijzigingen sinds de vorige keer op, en af en toe ook nieuwe evenementen. Wordt aangeroepen door:
//  - de geplande taak elke 5 minuten (GitHub Actions -> /api/cron/fullhouse-sync),
//  - de dagelijkse Vercel-cron (/api/cron/tickets) als vangnet,
//  - het openen van het dashboard, de Fullhouse-pagina of Wedstrijddag live (hooguit eens per paar minuten),
//  - de knop "Nu synchroniseren".
// Er draait nooit meer dan één ronde tegelijk; een vastgelopen ronde telt na 5 minuten als mislukt.

export type AutoSyncTrigger = "cron" | "schedule" | "page" | "manual";

const STALE_MS = 5 * 60_000;
const EVENTS_EVERY_MS = 60 * 60_000;
const BUDGET_MS: Record<AutoSyncTrigger, number> = { cron: 240_000, schedule: 50_000, page: 25_000, manual: 50_000 };

export interface AutoSyncResult {
  skipped?: string;
  ok?: number;
  failed?: number;
  postponed?: number;
  fetched?: number;
  events?: { fetched: number; created: number } | { error: string } | null;
}

const errMsg = (e: unknown) => (e instanceof FullhouseError || e instanceof Error ? e.message : "Onbekende fout");

/** Wedstrijden die automatisch bijgehouden worden: van gisteren tot 120 dagen vooruit, plus seizoenspassen. Dichtstbijzijnde eerst. */
async function eventsInView(now: Date) {
  const rows = await prisma.ticketEvent.findMany({
    where: {
      source: "FULLHOUSE",
      externalId: { not: null },
      archivedAt: null,
      status: { not: "CANCELLED" },
      OR: [{ startsAt: { lte: new Date(now.getTime() + 120 * 86_400_000) }, endsAt: { gte: new Date(now.getTime() - 86_400_000) } }, { title: { contains: "seizoen", mode: "insensitive" } }],
    },
    select: { externalId: true, startsAt: true },
  });
  return rows.sort((a, b) => Math.abs(a.startsAt.getTime() - now.getTime()) - Math.abs(b.startsAt.getTime() - now.getTime())).map((r) => r.externalId!);
}

export async function runAutoSync(opts: { trigger: AutoSyncTrigger; minIntervalMs?: number; who?: { id: string | null; name: string }; allowMock?: boolean; now?: () => number }): Promise<AutoSyncResult> {
  const clock = opts.now ?? Date.now;
  if (ticketProvider().mode === "mock" && !opts.allowMock) return { skipped: "testmodus" };
  const start = clock();
  // Vastgelopen rondes (bijv. een afgebroken functie) afsluiten, zodat ze een nieuwe ronde niet blokkeren.
  await prisma.ticketSyncRun.updateMany({ where: { kind: "auto", status: "RUNNING", startedAt: { lt: new Date(start - STALE_MS) } }, data: { status: "FAILED", error: "Afgebroken: duurde te lang.", finishedAt: new Date(start) } });
  if (await prisma.ticketSyncRun.findFirst({ where: { kind: "auto", status: "RUNNING" }, select: { id: true } })) return { skipped: "Er loopt al een synchronisatie." };
  if (opts.minIntervalMs) {
    const last = await prisma.ticketSyncRun.findFirst({ where: { kind: "auto" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
    if (last && start - last.startedAt.getTime() < opts.minIntervalMs) return { skipped: "Net nog gesynchroniseerd." };
  }
  const name = opts.trigger === "manual" ? (opts.who?.name ?? "Handmatig") : AUTO_NAMES[opts.trigger];
  const run = await prisma.ticketSyncRun.create({ data: { kind: "auto", status: "RUNNING", mode: ticketProvider().mode, startedBy: name } });
  const deadline = start + BUDGET_MS[opts.trigger];
  const who = { id: opts.who?.id ?? null, name: AUTO_NAMES.ticket };
  const errors: string[] = [];

  // Nieuwe evenementen, kaartsoorten en vakken: bij de dagelijkse ronde en handmatig altijd, anders hooguit eens per uur.
  let events: AutoSyncResult["events"] = null;
  const lastEvents = await prisma.ticketSyncRun.findFirst({ where: { kind: "events", status: "OK" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
  if (opts.trigger === "cron" || opts.trigger === "manual" || !lastEvents || start - lastEvents.startedAt.getTime() > EVENTS_EVERY_MS) {
    try {
      events = await importEventsAs({ id: who.id, name });
    } catch (e) {
      events = { error: errMsg(e) };
      errors.push(`evenementen: ${errMsg(e)}`);
    }
  }

  const list = await eventsInView(new Date(start));
  let ok = 0;
  let failed = 0;
  let fetched = 0;
  let done = 0;
  for (const ext of list) {
    if (clock() > deadline) break;
    done++;
    try {
      const r = await syncEventTickets(who, ext, { quiet: true });
      fetched += r.fetched;
      ok++;
    } catch (e) {
      failed++;
      if (errors.length < 3) errors.push(errMsg(e));
    }
  }
  const postponed = list.length - done;
  const failedAll = failed > 0 && ok === 0;
  const status = errors.length > 0 ? "FAILED" : "OK";
  const error = errors.length ? `${failed ? `${failed} van ${done} wedstrijden mislukt. ` : ""}${errors.join(" · ")}`.slice(0, 300) : null;
  await prisma.ticketSyncRun.update({ where: { id: run.id }, data: { status, error, fetched, upserted: ok, finishedAt: new Date(clock()) } });
  // Een storing die begint (vorige ronde ging goed) komt in het auditlog; herhalingen niet.
  if (failedAll || (events && "error" in events && ok === 0)) {
    const prev = await prisma.ticketSyncRun.findFirst({ where: { kind: "auto", id: { not: run.id }, status: { not: "RUNNING" } }, orderBy: { startedAt: "desc" }, select: { status: true } });
    if (prev?.status !== "FAILED") await ticketAudit({ action: "sync.failed", actor: { id: null, name }, summary: "Automatische Fullhouse-synchronisatie mislukt", reason: error ?? undefined });
  }
  return { ok, failed, postponed, fetched, events };
}
