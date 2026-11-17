import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAudit } from "./audit.server";
import { need, type TicketsActor } from "./authz.server";
import { ticketProvider } from "./fullhouse";
import { FullhouseError, type FullhouseHolderTicket, type FullhouseSearchResult } from "./fullhouse/types";
import { hitLimit } from "./public-limit.server";
import { SCAN_REASON_LABELS, type ScanReason } from "./rules";
import { likeLiteral } from "./like";
import { codeHash, initialsFromFullName } from "./scan.server";
import {
  detectKind,
  fullhouseSupportStatus,
  groupByCustomer,
  hhcPublicIdFrom,
  isHhcPublicId,
  hhcSupportStatus,
  maskBarcode,
  maskEmail,
  maskTerm,
  validateTerm,
  type ResolvedKind,
  type SupportStatus,
} from "./support-search";

// Zoektool in Klantenservice: klanten en tickets in het HHC-ticketsysteem én in Fullhouse.
//
// Privacy en rechten:
//  - Alleen met het recht "support:search" (HHC Tickets-rol). E-mailadressen alleen voluit met
//    "tickets:personal"; anders gemaskeerd. Fullhouse-barcodes altijd gemaskeerd (laatste 4).
//  - De zoekterm gaat in de body van een POST, nooit in een URL (geen logs, geen browsergeschiedenis).
//  - Elke zoekopdracht komt in het auditlog met soort, gemaskeerde term en aantallen.
//  - Begrensd per medewerker (database-teller, want serverless deelt geen geheugen).
//  - Fullhouse alleen lezen: live GET-verzoeken met de API-sleutel; niets wordt opgeslagen.
//    Scanhistorie van Fullhouse-tickets komt uit de eigen scanner (via een hash van de barcode).

export const supportSearchSchema = z.object({
  // Stuurtekens (zoals een nul-teken uit een geplakte tekst) weglaten: Postgres weigert ze.
  q: z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ""))
    .pipe(z.string().trim().min(1, "Vul een zoekterm in.").max(120, "Zoekterm is te lang.")),
  kind: z.enum(["auto", "name", "email", "ticket", "order"]).default("auto"),
});

const MAX_HHC = 50;
const LIMIT_SHORT = { max: 30, windowMs: 5 * 60_000 };
const LIMIT_DAY = { max: 400, windowMs: 24 * 3600_000 };

interface ScanOut {
  at: Date;
  result: string;
  reason: string | null;
  event: string | null;
  where: string | null;
  reentry: boolean;
  overridden: boolean;
}

export interface HhcTicketOut {
  id: string;
  publicId: string;
  type: string;
  zone: string | null;
  isSeasonCard: boolean;
  status: SupportStatus;
  statusReason: string | null;
  validity: string;
  events: { title: string; startsAt: Date; cancelled: boolean }[];
  scans: ScanOut[];
  lastMail: { at: Date; status: string } | null;
  canResend: boolean;
  anonymized: boolean;
}

export interface FullhouseTicketOut {
  externalId: string;
  barcode: string | null;
  ticketName: string | null;
  event: { title: string; startsAt: Date | null; cancelled: boolean } | null;
  isSeasonCard: boolean;
  status: SupportStatus;
  fullhouseStatus: string;
  place: string | null;
  orderNumber: string | null;
  boughtAt: Date | null;
  scans: ScanOut[];
  syncedAt: Date | null;
}

export interface CustomerOut<T> {
  key: string;
  name: string | null;
  email: string | null;
  tickets: T[];
}

export type FullhouseState = "live" | "test" | "local" | "unavailable";

const safeName = (first: string, last: string) => `${first} ${last}`.trim();

/** Scanhistorie voor HHC-tickets (op ticket-id) of Fullhouse-tickets (op hash van de barcode). */
async function scansFor(where: Prisma.TicketScanWhereInput): Promise<(ScanOut & { ticketId: string | null; codeHash: string | null })[]> {
  const rows = await prisma.ticketScan.findMany({ where, orderBy: { scannedAt: "desc" }, take: 300, include: { scanner: { select: { name: true } } } });
  const eventIds = [...new Set(rows.map((r) => r.eventId))];
  const entranceIds = [...new Set(rows.map((r) => r.entranceId).filter((v): v is string => !!v))];
  const [events, entrances] = await Promise.all([
    eventIds.length ? prisma.ticketEvent.findMany({ where: { id: { in: eventIds } }, select: { id: true, title: true } }) : [],
    entranceIds.length ? prisma.ticketEntrance.findMany({ where: { id: { in: entranceIds } }, select: { id: true, name: true } }) : [],
  ]);
  const ev = new Map(events.map((e) => [e.id, e.title]));
  const en = new Map(entrances.map((e) => [e.id, e.name]));
  return rows.map((r) => ({
    ticketId: r.ticketId,
    codeHash: r.codeHash,
    at: r.scannedAt,
    result: r.result,
    reason: r.reason ? (SCAN_REASON_LABELS[r.reason as ScanReason] ?? r.reason) : null,
    event: ev.get(r.eventId) ?? null,
    where: [r.entranceId ? en.get(r.entranceId) : null, r.scanner?.name].filter(Boolean).join(" · ") || null,
    reentry: r.reentry,
    overridden: !!r.overrideById,
  }));
}

const strip = (s: ScanOut & { ticketId: string | null; codeHash: string | null }): ScanOut => ({ at: s.at, result: s.result, reason: s.reason, event: s.event, where: s.where, reentry: s.reentry, overridden: s.overridden });

// ── HHC ──

function hhcWhere(kind: ResolvedKind, q: string): Prisma.TicketWhereInput {
  if (kind === "email") return { email: { equals: likeLiteral(q), mode: "insensitive" } };
  if (kind === "ticket") {
    const id = hhcPublicIdFrom(q);
    return { OR: [id.length === 16 ? { publicId: id } : { publicId: { startsWith: likeLiteral(id) } }, { externalRef: q }] };
  }
  if (kind === "order") return { OR: [{ externalRef: q }, { batchId: q }] };
  // Naam: elk woord moet in voornaam, achternaam of bedrijf voorkomen.
  const words = q.split(/\s+/).filter(Boolean).slice(0, 4).map(likeLiteral);
  const byName: Prisma.TicketWhereInput = { AND: words.map((w) => ({ OR: [{ firstName: { contains: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }, { company: { contains: w, mode: "insensitive" as const } }] })) };
  // Een ticketkenmerk zonder cijfers ziet er voor "Automatisch" uit als een naam; zoek dan ook op kenmerk.
  const asId = q.trim().toUpperCase();
  return isHhcPublicId(asId) ? { OR: [byName, { publicId: asId }] } : byName;
}

async function searchHhc(actor: TicketsActor, kind: ResolvedKind, q: string) {
  const personal = actor.access.can("tickets:personal");
  const canResend = actor.access.can("tickets:resend");
  const rows = await prisma.ticket.findMany({
    where: { source: "HHC", ...hhcWhere(kind, q) },
    orderBy: { createdAt: "desc" },
    take: MAX_HHC + 1,
    include: {
      type: { select: { name: true } },
      zone: { select: { name: true } },
      season: { select: { name: true } },
      links: { select: { event: { select: { id: true, title: true, startsAt: true, status: true } } } },
    },
  });
  const truncated = rows.length > MAX_HHC;
  const list = rows.slice(0, MAX_HHC);
  const ids = list.map((t) => t.id);
  const [scans, mails] = await Promise.all([
    ids.length ? scansFor({ ticketId: { in: ids } }) : [],
    ids.length ? prisma.ticketDelivery.findMany({ where: { ticketId: { in: ids }, channel: "EMAIL" }, orderBy: { createdAt: "desc" }, select: { ticketId: true, createdAt: true, status: true } }) : [],
  ]);
  const now = new Date();
  const out = list.map((t) => {
    const own = scans.filter((s) => s.ticketId === t.id);
    const events = t.links.map((l) => l.event).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const lastMail = mails.find((m) => m.ticketId === t.id);
    const expired = !!t.validUntil && now > t.validUntil;
    const status = hhcSupportStatus({
      status: t.status,
      expired,
      allEventsCancelled: events.length > 0 && events.every((e) => e.status === "CANCELLED"),
      scanned: own.some((s) => s.result === "VALID"),
    });
    const anonymized = !!t.anonymizedAt;
    const ticket: HhcTicketOut = {
      id: t.id,
      publicId: t.publicId,
      type: t.type.name,
      zone: t.zone?.name ?? null,
      isSeasonCard: t.isSeasonCard,
      status,
      statusReason: t.statusReason,
      validity: events.length === 1 ? events[0].title : events.length > 1 ? `${events.length} wedstrijden` : (t.season?.name ?? (t.validUntil ? "Tot einddatum" : "Doorlopend")),
      events: events.map((e) => ({ title: e.title, startsAt: e.startsAt, cancelled: e.status === "CANCELLED" })),
      scans: own.slice(0, 20).map(strip),
      lastMail: lastMail ? { at: lastMail.createdAt, status: lastMail.status } : null,
      canResend: canResend && !anonymized && t.status === "ACTIVE" && !expired && !!t.email,
      anonymized,
    };
    return { ticket, name: anonymized ? "Geanonimiseerd" : safeName(t.firstName, t.lastName), email: anonymized ? null : t.email };
  });
  const groups = groupByCustomer(out.map((o) => ({ ...o.ticket, name: o.name, email: o.email })));
  const customers: CustomerOut<HhcTicketOut>[] = groups.map((g, i) => ({
    key: `hhc-${i}`,
    name: g.name,
    email: personal ? g.email : maskEmail(g.email),
    tickets: g.tickets.map(({ name: _n, email: _e, ...t }) => (void _n, void _e, t)),
  }));
  return { customers, count: list.length, truncated };
}

// ── Fullhouse ──

async function fullhouseLive(kind: ResolvedKind, q: string): Promise<{ state: FullhouseState; result: FullhouseSearchResult | null; message: string | null }> {
  const provider = ticketProvider();
  const test = provider.mode === "mock";
  try {
    if (provider.searchHolders) return { state: test ? "test" : "live", result: await provider.searchHolders(kind, q), message: null };
    // Alleen een scanapparaat-token: Fullhouse laat dan alleen opzoeken op barcode toe.
    if (kind === "ticket") {
      const t = await provider.lookupBarcode(q);
      return { state: "live", result: { tickets: t ? [{ ...t, email: null, customerId: null, transactionId: null, createdAt: null }] : [], truncated: false }, message: "Met alleen een scanapparaat-token kan Fullhouse alleen op barcode zoeken." };
    }
    return { state: "unavailable", result: null, message: "Zoeken op naam, e-mail of ordernummer in Fullhouse kan alleen met een Fullhouse API-sleutel (FULLHOUSE_API_KEY)." };
  } catch (e) {
    const msg = e instanceof FullhouseError ? e.message : "Fullhouse gaf een onverwachte fout.";
    return { state: "unavailable", result: null, message: msg };
  }
}

async function searchFullhouse(actor: TicketsActor, kind: ResolvedKind, q: string) {
  const personal = actor.access.can("tickets:personal");
  const live = await fullhouseLive(kind, q);
  const lastSync = await prisma.ticketSyncRun.findFirst({ where: { kind: "tickets", status: "OK" }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } });

  let tickets: FullhouseHolderTicket[] = live.result?.tickets ?? [];
  let state = live.state;
  let message = live.message;

  // Fullhouse niet bereikbaar en er is op barcode gezocht: dan de eigen gesynchroniseerde kopie (zonder naam en e-mail).
  if (!live.result && kind === "ticket") {
    const local = await prisma.ticketExternalTicket.findMany({ where: { codeHash: codeHash(q) }, take: 10 });
    if (local.length) {
      state = "local";
      message = `${message ?? "Fullhouse is niet bereikbaar."} Hieronder de eigen kopie van de laatste synchronisatie (zonder naam en e-mail).`;
      tickets = local.map((l) => ({
        externalId: l.externalId,
        barcode: q,
        name: l.holderLabel,
        ticketTypeId: l.ticketTypeId,
        ticketName: l.ticketName,
        categoryRef: l.categoryRef,
        eventId: l.eventExtId,
        status: l.status,
        area: l.area,
        row: null,
        seat: null,
        updatedAt: l.updatedAt,
        email: null,
        customerId: null,
        transactionId: null,
        createdAt: null,
      }));
    }
  }

  const hashes = [...new Set(tickets.map((t) => codeHash(t.barcode)))];
  const extEventIds = [...new Set(tickets.map((t) => t.eventId).filter(Boolean))];
  const [events, scans, synced] = await Promise.all([
    extEventIds.length ? prisma.ticketEvent.findMany({ where: { externalId: { in: extEventIds } }, select: { externalId: true, title: true, startsAt: true, status: true } }) : [],
    hashes.length ? scansFor({ codeHash: { in: hashes } }) : [],
    hashes.length ? prisma.ticketExternalTicket.findMany({ where: { codeHash: { in: hashes } }, select: { codeHash: true, syncedAt: true } }) : [],
  ]);
  const evMap = new Map(events.map((e) => [e.externalId!, e]));
  const out = tickets.map((t) => {
    const h = codeHash(t.barcode);
    const own = scans.filter((s) => s.codeHash === h);
    const ev = evMap.get(t.eventId);
    const cancelled = ev?.status === "CANCELLED";
    const ticket: FullhouseTicketOut = {
      externalId: t.externalId,
      barcode: maskBarcode(t.barcode),
      ticketName: t.ticketName,
      event: ev ? { title: ev.title, startsAt: ev.startsAt, cancelled } : null,
      isSeasonCard: /seizoen/i.test(ev?.title ?? "") || /seizoen/i.test(t.ticketName ?? ""),
      status: fullhouseSupportStatus({ status: String(t.status), eventCancelled: cancelled, scanned: own.some((s) => s.result === "VALID") }),
      fullhouseStatus: String(t.status),
      place: [t.area, t.row ? `rij ${t.row}` : null, t.seat ? `stoel ${t.seat}` : null].filter(Boolean).join(", ") || null,
      orderNumber: t.transactionId,
      boughtAt: t.createdAt,
      scans: own.slice(0, 20).map(strip),
      syncedAt: synced.find((s) => s.codeHash === h)?.syncedAt ?? null,
    };
    // In de lokale kopie staan alleen initialen; die tonen we zoals ze zijn.
    return { ...ticket, name: t.name ? (state === "local" ? initialsFromFullName(t.name) : t.name) : null, email: t.email };
  });
  const customers: CustomerOut<FullhouseTicketOut>[] = groupByCustomer(out).map((g, i) => ({
    key: `fh-${i}`,
    name: g.name,
    email: personal ? g.email : maskEmail(g.email),
    tickets: g.tickets.map(({ name: _n, email: _e, ...t }) => (void _n, void _e, t)),
  }));
  return { state, message, lastSync: lastSync?.finishedAt ?? null, customers, count: out.length, truncated: live.result?.truncated ?? false };
}

/** De zoekopdracht zelf: rechten, limiet, beide bronnen tegelijk en het auditlog. */
export async function supportSearch(actor: TicketsActor, raw: unknown, opts: { skipLimit?: boolean } = {}) {
  need(actor, "support:search");
  const { q, kind: asked } = supportSearchSchema.parse(raw);
  const kind = asked === "auto" ? detectKind(q) : asked;
  const invalid = validateTerm(kind, q);
  if (invalid) throw new ApiError(400, invalid);
  if (!opts.skipLimit) {
    if (await hitLimit("support-search", actor.id, LIMIT_SHORT.max, LIMIT_SHORT.windowMs)) throw new ApiError(429, "Je zoekt erg vaak achter elkaar. Wacht een paar minuten en probeer het opnieuw.");
    if (await hitLimit("support-search-day", actor.id, LIMIT_DAY.max, LIMIT_DAY.windowMs)) throw new ApiError(429, "Het maximum aantal zoekopdrachten voor vandaag is bereikt.");
  }
  const [hhc, fullhouse] = await Promise.all([searchHhc(actor, kind, q), searchFullhouse(actor, kind, q)]);
  await ticketAudit({
    action: "support.search",
    actor: { id: actor.id, name: actor.name },
    summary: `Klantenservice: gezocht op ${kind === "name" ? "naam" : kind === "email" ? "e-mailadres" : kind === "ticket" ? "ticket- of kaartnummer" : "ordernummer"}`,
    meta: { kind, term: maskTerm(kind, q), hhc: hhc.count, fullhouse: fullhouse.count, fullhouseState: fullhouse.state },
  });
  return {
    kind,
    personal: actor.access.can("tickets:personal"),
    canView: actor.access.can("tickets:read"),
    hhc,
    fullhouse,
  };
}

export type SupportSearchResult = Awaited<ReturnType<typeof supportSearch>>;
