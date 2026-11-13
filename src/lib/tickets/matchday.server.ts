import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAudit } from "./audit.server";
import { need, type TicketsActor } from "./authz.server";
import { processScan } from "./scan.server";
import type { ScanActor } from "./scanner-auth.server";
import { qrCodeFor } from "./token";

// Wedstrijddag: live bezetting, ingangen, meldingen bij verdachte scans en handmatig inchecken.
// Alles wordt uit de scanlog berekend (geen eigen tabel), zodat het nooit afwijkt van de scans.

const BUCKET_MS = 15 * 60_000;
const RECENT_MS = 15 * 60_000;
const MAX_SCANS = 30_000;

export type AlertLevel = "red" | "amber" | "info";
export interface MatchdayAlert {
  id: string;
  level: AlertLevel;
  text: string;
  at: string | null;
}

interface ScanLite {
  id: string;
  ticketId: string | null;
  codeHash: string | null;
  result: string;
  reason: string | null;
  reentry: boolean;
  entranceId: string | null;
  scannerId: string | null;
  scannedAt: Date;
  overrideBy: string | null;
  overrideReason: string | null;
  note: string | null;
  holderLabel: string | null;
}

const keyOf = (s: Pick<ScanLite, "ticketId" | "codeHash">) => s.ticketId ?? s.codeHash ?? null;

/** Meldingen op basis van het scanlog. Puur (geen database), zodat het te testen is. */
export function buildAlerts(
  scans: ScanLite[],
  ctx: { now: Date; inside: number; capacity: number | null; scannerNames: Map<string, string>; entranceNames: Map<string, string> },
): MatchdayAlert[] {
  const alerts: MatchdayAlert[] = [];

  // 1. Capaciteit.
  if (ctx.capacity && ctx.capacity > 0) {
    const pct = (ctx.inside / ctx.capacity) * 100;
    if (pct >= 100) alerts.push({ id: "cap-full", level: "red", text: `Capaciteit bereikt: ${ctx.inside} van ${ctx.capacity} binnen.`, at: null });
    else if (pct >= 90) alerts.push({ id: "cap-90", level: "amber", text: `Bijna vol: ${ctx.inside} van ${ctx.capacity} binnen (${Math.round(pct)}%).`, at: null });
  }

  // 2. Hetzelfde ticket meerdere keer geweigerd of als "al gebruikt" gemeld.
  const refused = new Map<string, ScanLite[]>();
  for (const s of scans) {
    if (s.result === "VALID") continue;
    const k = keyOf(s);
    if (!k) continue;
    refused.set(k, [...(refused.get(k) ?? []), s]);
  }
  for (const [k, list] of refused) {
    if (list.length >= 3) {
      const last = list.reduce((a, b) => (a.scannedAt > b.scannedAt ? a : b));
      alerts.push({ id: `repeat-${k}`, level: "red", text: `${list.length} mislukte pogingen met hetzelfde ticket${last.holderLabel ? ` (${last.holderLabel})` : ""}.`, at: last.scannedAt.toISOString() });
    }
  }

  // 3. Overrides en handmatige check-ins.
  for (const s of scans) {
    if (s.overrideBy) alerts.push({ id: `ovr-${s.id}`, level: "amber", text: `${s.overrideBy} liet een scan toe${s.holderLabel ? ` (${s.holderLabel})` : ""}: ${s.overrideReason ?? "geen reden"}.`, at: s.scannedAt.toISOString() });
  }

  // 4. Veel onbekende codes in korte tijd bij één scanner (iemand probeert iets).
  const byScanner = new Map<string, Date[]>();
  for (const s of scans) {
    if (s.reason !== "NOT_FOUND" || !s.scannerId) continue;
    byScanner.set(s.scannerId, [...(byScanner.get(s.scannerId) ?? []), s.scannedAt]);
  }
  for (const [id, times] of byScanner) {
    times.sort((a, b) => a.getTime() - b.getTime());
    let worst = 0;
    let at = times[0];
    for (let i = 0, j = 0; i < times.length; i++) {
      while (times[i].getTime() - times[j].getTime() > 10 * 60_000) j++;
      if (i - j + 1 > worst) {
        worst = i - j + 1;
        at = times[i];
      }
    }
    if (worst >= 5) alerts.push({ id: `nf-${id}`, level: "amber", text: `${ctx.scannerNames.get(id) ?? "Een scanner"} kreeg ${worst} onbekende codes binnen 10 minuten.`, at: at.toISOString() });
  }

  // 5. Veel "verkeerd vak" bij één ingang: mogelijk verkeerde ingang bekendgemaakt.
  const wrongZone = new Map<string, number>();
  for (const s of scans) if (s.reason === "WRONG_ZONE") wrongZone.set(s.entranceId ?? "", (wrongZone.get(s.entranceId ?? "") ?? 0) + 1);
  for (const [id, n] of wrongZone) {
    if (n >= 3) alerts.push({ id: `zone-${id}`, level: "amber", text: `${n} bezoekers met een ticket voor een ander vak bij ${(id && ctx.entranceNames.get(id)) || "een ingang"}.`, at: null });
  }

  const order = { red: 0, amber: 1, info: 2 } as const;
  return alerts.sort((a, b) => order[a.level] - order[b.level] || (b.at ?? "").localeCompare(a.at ?? ""));
}

/** Aantal geldige scans per kwartier, met lege kwartieren ertussen. */
export function timeline(scans: Pick<ScanLite, "result" | "scannedAt" | "reentry">[]): { at: string; count: number }[] {
  const valid = scans.filter((s) => s.result === "VALID" && !s.reentry);
  if (valid.length === 0) return [];
  const first = Math.floor(Math.min(...valid.map((s) => s.scannedAt.getTime())) / BUCKET_MS) * BUCKET_MS;
  const last = Math.floor(Math.max(...valid.map((s) => s.scannedAt.getTime())) / BUCKET_MS) * BUCKET_MS;
  const out: { at: string; count: number }[] = [];
  for (let t = first; t <= last; t += BUCKET_MS) out.push({ at: new Date(t).toISOString(), count: 0 });
  for (const s of valid) out[(Math.floor(s.scannedAt.getTime() / BUCKET_MS) * BUCKET_MS - first) / BUCKET_MS].count++;
  return out;
}

export async function matchdayEvents() {
  const now = Date.now();
  const rows = await prisma.ticketEvent.findMany({
    where: { status: { not: "CANCELLED" }, startsAt: { lte: new Date(now + 14 * 86_400_000) }, endsAt: { gte: new Date(now - 14 * 86_400_000) } },
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true, startsAt: true, endsAt: true },
  });
  // Standaard: de wedstrijd die nu bezig is, anders de eerstvolgende, anders de laatste.
  const live = rows.find((e) => e.startsAt.getTime() - 3 * 3600_000 <= now && e.endsAt.getTime() + 3 * 3600_000 >= now);
  const next = rows.find((e) => e.startsAt.getTime() > now);
  return { events: rows, defaultId: (live ?? next ?? rows[rows.length - 1])?.id ?? null };
}

export async function matchdayOverview(eventId: string) {
  const event = await prisma.ticketEvent.findUnique({ where: { id: eventId }, select: { id: true, title: true, startsAt: true, endsAt: true, capacity: true, externalId: true, status: true } });
  if (!event) throw new ApiError(404, "Wedstrijd niet gevonden.");
  const now = new Date();
  const scans: ScanLite[] = await prisma.ticketScan.findMany({
    where: { eventId },
    orderBy: { scannedAt: "asc" },
    take: MAX_SCANS,
    select: { id: true, ticketId: true, codeHash: true, result: true, reason: true, reentry: true, entranceId: true, scannerId: true, scannedAt: true, overrideBy: true, overrideReason: true, note: true, holderLabel: true },
  });
  const [entrances, scanners, zones] = await Promise.all([
    prisma.ticketEntrance.findMany({ select: { id: true, name: true, zoneId: true } }),
    prisma.ticketScanner.findMany({ select: { id: true, name: true, lastSeenAt: true, active: true } }),
    prisma.ticketZone.findMany({ select: { id: true, name: true } }),
  ]);
  const entranceNames = new Map(entrances.map((e) => [e.id, e.name]));
  const scannerNames = new Map(scanners.map((s) => [s.id, s.name]));
  const zoneNames = new Map(zones.map((z) => [z.id, z.name]));

  // Personen binnen: elk ticket telt één keer, ook bij heen en weer lopen.
  const admitted = new Map<string, ScanLite>();
  for (const s of scans) {
    if (s.result !== "VALID") continue;
    const k = keyOf(s);
    if (k && !admitted.has(k)) admitted.set(k, s);
  }
  const inside = admitted.size;

  // Per vak: HHC-tickets via hun vak, Fullhouse-tickets via zone/categorie uit Fullhouse.
  const hhcIds = [...admitted.values()].map((s) => s.ticketId).filter((x): x is string => !!x);
  const hhcZones = new Map((await prisma.ticket.findMany({ where: { id: { in: hhcIds } }, select: { id: true, zoneId: true } })).map((t) => [t.id, t.zoneId]));
  const extHashes = [...admitted.values()].map((s) => s.codeHash).filter((x): x is string => !!x);
  const ext = event.externalId && extHashes.length
    ? new Map((await prisma.ticketExternalTicket.findMany({ where: { eventExtId: event.externalId, codeHash: { in: extHashes } }, select: { codeHash: true, area: true, categoryRef: true } })).map((t) => [t.codeHash, t.area ?? t.categoryRef]))
    : new Map<string, string | null>();
  const zoneCount = new Map<string, number>();
  for (const s of admitted.values()) {
    const name = s.ticketId ? (hhcZones.get(s.ticketId) && zoneNames.get(hhcZones.get(s.ticketId)!)) || "Zonder vak" : (s.codeHash && ext.get(s.codeHash)) || "Zonder vak";
    zoneCount.set(name, (zoneCount.get(name) ?? 0) + 1);
  }

  // Per ingang: totaal en laatste kwartier.
  const entranceRows = new Map<string, { name: string; total: number; recent: number }>();
  for (const s of scans) {
    if (s.result !== "VALID") continue;
    const id = s.entranceId ?? "";
    const row = entranceRows.get(id) ?? { name: (id && entranceNames.get(id)) || "Zonder ingang", total: 0, recent: 0 };
    row.total++;
    if (now.getTime() - s.scannedAt.getTime() <= RECENT_MS) row.recent++;
    entranceRows.set(id, row);
  }

  const valid = scans.filter((s) => s.result === "VALID").length;
  const refused = scans.filter((s) => s.result !== "VALID").length;
  const alerts = buildAlerts(scans, { now, inside, capacity: event.capacity, scannerNames, entranceNames });
  // Verwacht aantal: alleen de geldige Fullhouse-tickets (HHC-tickets tellen is te zwaar voor een live pagina).
  const expectedExternal = event.externalId ? await prisma.ticketExternalTicket.count({ where: { eventExtId: event.externalId, status: "VALID" } }) : 0;

  return {
    event,
    now: now.toISOString(),
    inside,
    capacity: event.capacity,
    valid,
    refused,
    expectedExternal,
    lastScanAt: scans.length ? scans[scans.length - 1].scannedAt.toISOString() : null,
    zones: [...zoneCount.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    entrances: [...entranceRows.values()].sort((a, b) => b.total - a.total),
    timeline: timeline(scans),
    alerts,
    scanners: scanners.filter((s) => s.active).map((s) => ({ name: s.name, lastSeenAt: s.lastSeenAt?.toISOString() ?? null })),
  };
}

// ── Handmatig inchecken (alleen supervisors) ──

const manualSchema = z.object({
  eventId: z.string().min(1).max(40),
  ticketId: z.string().min(1).max(40),
  reason: z.string().trim().min(3, "Geef een korte reden.").max(300),
  entranceId: z.string().max(40).nullish(),
});

/** Zoek HHC-tickets om handmatig in te checken (op ticketkenmerk; op naam alleen met inzage in contactgegevens). */
export async function manualSearch(actor: TicketsActor, q: string) {
  need(actor, "scan:override");
  const term = q.trim();
  if (term.length < 2) return { rows: [] };
  const personal = actor.access.can("tickets:personal");
  const rows = await prisma.ticket.findMany({
    where: {
      source: "HHC",
      status: "ACTIVE",
      anonymizedAt: null,
      OR: personal
        ? [{ publicId: { startsWith: term.toUpperCase() } }, { firstName: { contains: term, mode: "insensitive" } }, { lastName: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }]
        : [{ publicId: { startsWith: term.toUpperCase() } }],
    },
    take: 10,
    orderBy: { createdAt: "desc" },
    select: { id: true, publicId: true, firstName: true, lastName: true, type: { select: { name: true } } },
  });
  return { rows: rows.map((t) => ({ id: t.id, publicId: t.publicId, name: personal ? `${t.firstName} ${t.lastName}` : `${t.firstName[0] ?? ""}. ${t.lastName[0] ?? ""}.`, type: t.type.name })) };
}

/**
 * Een bezoeker met een HHC-ticket handmatig binnenlaten, bijvoorbeeld als de telefoon leeg is.
 * Loopt door dezelfde scanlogica; faalt het ticket op een regel (verkeerde wedstrijd, al gebruikt),
 * dan wordt dat als override met reden vastgelegd en gemeld in het overzicht.
 */
export async function manualCheckIn(actor: TicketsActor, raw: unknown) {
  need(actor, "scan:override");
  const input = manualSchema.parse(raw);
  const ticket = await prisma.ticket.findUnique({ where: { id: input.ticketId }, select: { id: true, publicId: true, qrVersion: true, status: true, anonymizedAt: true } });
  if (!ticket || ticket.anonymizedAt) throw new ApiError(404, "Ticket niet gevonden.");
  if (ticket.status !== "ACTIVE") throw new ApiError(400, "Alleen actieve tickets kunnen handmatig worden ingecheckt.");
  const scanActor: ScanActor = { kind: "user", name: actor.name, scannerId: null, userId: actor.id, entranceId: null, canOverride: true, canSeeStats: true };
  const res = await processScan(scanActor, {
    eventId: input.eventId,
    code: qrCodeFor(ticket.publicId, ticket.qrVersion),
    clientId: `manual-${randomUUID()}`,
    entranceId: input.entranceId ?? null,
    note: `Handmatig ingecheckt: ${input.reason}`,
    override: { reason: input.reason },
  });
  await ticketAudit({ action: "scan.manual", actor: { id: actor.id, name: actor.name }, ticketId: ticket.id, eventId: input.eventId, reason: input.reason, summary: "Ticket handmatig ingecheckt", meta: { result: res.result } });
  return res;
}
