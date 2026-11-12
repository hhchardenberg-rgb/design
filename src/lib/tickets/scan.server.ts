import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAuditTx } from "./audit.server";
import { initialsOf } from "./issue";
import { ticketProvider } from "./fullhouse";
import { FullhouseError } from "./fullhouse/types";
import { coversEvent, evaluateScan, SCAN_REASON_LABELS, type RuleEvent, type RuleTicket, type ScanReason, type TicketStatus, type ValidityMode } from "./rules";
import type { ScanActor } from "./scanner-auth.server";
import { detectSource, parseQrCode } from "./token";

// De scanlogica op de server. De server is de enige die beslist: het apparaat krijgt een
// uitslag terug. Elke poging (ook een mislukte) wordt vastgelegd. Dubbel scannen wordt
// per ticket geserialiseerd (advisory lock), zodat twee scanners tegelijk nooit allebei
// "geldig" krijgen.

export const scanInputSchema = z.object({
  eventId: z.string().min(1).max(40),
  /** Bij meerdere wedstrijden tegelijk: de server kiest per scan de wedstrijd waar het ticket bij hoort. */
  eventIds: z.array(z.string().min(1).max(40)).min(1).max(10).optional(),
  code: z.string().min(1).max(300),
  entranceId: z.string().max(40).nullish(),
  clientId: z.string().min(8).max(64),
  scannedAt: z.string().datetime().nullish(),
  offline: z.boolean().optional(),
  note: z.string().max(300).nullish(),
  override: z.object({ reason: z.string().trim().min(3).max(300) }).nullish(),
});
export type ScanInput = z.infer<typeof scanInputSchema>;

export interface ScanResponse {
  scanId: string;
  clientId: string;
  result: "VALID" | "WARNING" | "INVALID";
  reason: ScanReason | null;
  reasonLabel: string | null;
  reentry: boolean;
  overridden: boolean;
  source: "HHC" | "FULLHOUSE";
  eventId: string;
  label: string | null;
  previous: { at: string; where: string | null } | null;
  /** Een supervisor mag deze uitslag met reden overrulen. */
  overridable: boolean;
  at: string;
}

const NOT_OVERRIDABLE: ScanReason[] = ["NOT_FOUND", "CANCELLED", "EVENT_NOT_ACTIVE"];
export const codeHash = (code: string) => createHash("sha256").update(code.trim()).digest("hex");

const rowToResponse = async (row: { id: string; clientId: string; result: string; reason: string | null; reentry: boolean; overrideById: string | null; source: string; holderLabel: string | null; scannedAt: Date; eventId: string; ticketId: string | null; codeHash: string | null }, actor: ScanActor | null): Promise<ScanResponse> => {
  let previous: ScanResponse["previous"] = null;
  if (row.result === "WARNING") {
    const prev = await prisma.ticketScan.findFirst({
      where: { eventId: row.eventId, result: "VALID", ...(row.ticketId ? { ticketId: row.ticketId } : { codeHash: row.codeHash }) },
      orderBy: { scannedAt: "desc" },
      include: { scanner: { select: { name: true } } },
    });
    if (prev) {
      const entrance = prev.entranceId ? await prisma.ticketEntrance.findUnique({ where: { id: prev.entranceId }, select: { name: true } }) : null;
      previous = { at: prev.scannedAt.toISOString(), where: entrance?.name ?? prev.scanner?.name ?? null };
    }
  }
  const reason = (row.reason as ScanReason | null) ?? null;
  return {
    scanId: row.id,
    clientId: row.clientId,
    result: row.result as ScanResponse["result"],
    reason,
    reasonLabel: reason ? SCAN_REASON_LABELS[reason] : null,
    reentry: row.reentry,
    overridden: !!row.overrideById || false,
    source: row.source as "HHC" | "FULLHOUSE",
    eventId: row.eventId,
    label: row.holderLabel,
    previous,
    overridable: !!actor?.canOverride && row.result !== "VALID" && !!reason && !NOT_OVERRIDABLE.includes(reason),
    at: row.scannedAt.toISOString(),
  };
};

const toRuleEvent = (e: { id: string; status: string; seasonId: string | null; competition: string | null; isHome: boolean; startsAt: Date; endsAt: Date; allowReentry: boolean }): RuleEvent => ({ ...e, status: e.status as RuleEvent["status"] });

const clampTime = (iso: string | null | undefined, offline: boolean | undefined) => {
  const now = Date.now();
  if (!iso || !offline) return new Date(now);
  const t = new Date(iso).getTime();
  return new Date(Math.min(now + 5 * 60000, Math.max(now - 24 * 3600000, t)));
};

/**
 * Welke wedstrijd hoort bij deze scan? Bij één gekozen wedstrijd die wedstrijd; bij meerdere de wedstrijd
 * waar het ticket bij hoort (Fullhouse: waar het ticket staat, HHC: waar het ticket geldt). Past het nergens,
 * dan de eerste gekozen wedstrijd, zodat de uitslag een nette reden toont.
 */
async function resolveEvent(input: ScanInput) {
  const ids = [...new Set([...(input.eventIds ?? []), input.eventId])];
  if (ids.length === 1) return prisma.ticketEvent.findUnique({ where: { id: input.eventId } });
  const events = (await prisma.ticketEvent.findMany({ where: { id: { in: ids } } })).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  if (events.length === 0) return null;
  const first = events.find((e) => e.id === input.eventId) ?? events[0];
  if (detectSource(input.code) === "HHC") {
    const ref = parseQrCode(input.code);
    const ticket = ref ? await prisma.ticket.findUnique({ where: { publicId: ref.publicId }, include: { links: { select: { eventId: true } } } }) : null;
    if (!ticket) return first;
    const rt: RuleTicket = { status: ticket.status as TicketStatus, validityMode: ticket.validityMode as ValidityMode, validFrom: ticket.validFrom, validUntil: ticket.validUntil, seasonId: ticket.seasonId, competitions: ticket.competitions, eventIds: ticket.links.map((l) => l.eventId), homeOnly: ticket.homeOnly, isSeasonCard: ticket.isSeasonCard, zoneId: ticket.zoneId };
    return events.find((e) => coversEvent(rt, toRuleEvent(e))) ?? first;
  }
  const hash = codeHash(input.code);
  const extIds = events.map((e) => e.externalId).filter((x): x is string => !!x);
  if (extIds.length) {
    const local = await prisma.ticketExternalTicket.findFirst({ where: { codeHash: hash, eventExtId: { in: extIds } }, select: { eventExtId: true } });
    const hit = local && events.find((e) => e.externalId === local.eventExtId);
    if (hit) return hit;
    for (const e of events) {
      if (!e.externalId) continue;
      const ext = await externalTicket(e.externalId, input.code, hash);
      if (ext.found && ext.found.eventExtId === e.externalId) return e;
    }
  }
  return first;
}

export async function processScan(actor: ScanActor, raw: unknown): Promise<ScanResponse> {
  const input = scanInputSchema.parse(raw);
  const existing = await prisma.ticketScan.findUnique({ where: { clientId: input.clientId } });
  if (existing) return rowToResponse(existing, actor);

  const event = await resolveEvent(input);
  if (!event) throw new ApiError(404, "Wedstrijd niet gevonden.");
  const entranceId = input.entranceId ?? actor.entranceId ?? null;
  const entrance = entranceId ? await prisma.ticketEntrance.findUnique({ where: { id: entranceId } }) : null;
  if (entrance && !entrance.active) throw new ApiError(400, "Deze ingang is niet actief.");
  if (input.override && !actor.canOverride) throw new ApiError(403, "Alleen een supervisor mag een scan overrulen.");

  const scannedAt = clampTime(input.scannedAt, input.offline);
  const source = detectSource(input.code);
  const ruleEvent = toRuleEvent(event);
  const base = { clientId: input.clientId, scannedAt, eventId: event.id, source, scannerId: actor.scannerId, userId: actor.userId, entranceId: entrance?.id ?? null, offline: !!input.offline, note: input.note ?? null };

  type Decision = { result: "VALID" | "WARNING" | "INVALID"; reason: ScanReason | null; reentry: boolean; ticketId: string | null; codeHash: string | null; holderLabel: string | null };
  let lockKey: string;
  let decide: (tx: Prisma.TransactionClient) => Promise<Decision>;

  if (source === "HHC") {
    const ref = parseQrCode(input.code);
    const ticket = ref
      ? await prisma.ticket.findUnique({ where: { publicId: ref.publicId }, include: { type: { select: { name: true } }, links: { select: { eventId: true } } } })
      : null;
    const valid = !!ticket && ticket.qrVersion === ref!.version && !ticket.anonymizedAt;
    lockKey = valid ? `t:${ticket!.id}:${event.id}` : `x:${input.clientId}`;
    decide = async (tx) => {
      if (!valid || !ticket) return { result: "INVALID", reason: "NOT_FOUND", reentry: false, ticketId: null, codeHash: null, holderLabel: null };
      const rt: RuleTicket = {
        status: ticket.status as TicketStatus,
        validityMode: ticket.validityMode as ValidityMode,
        validFrom: ticket.validFrom,
        validUntil: ticket.validUntil,
        seasonId: ticket.seasonId,
        competitions: ticket.competitions,
        eventIds: ticket.links.map((l) => l.eventId),
        homeOnly: ticket.homeOnly,
        isSeasonCard: ticket.isSeasonCard,
        zoneId: ticket.zoneId,
      };
      const prior = await tx.ticketScan.count({ where: { ticketId: ticket.id, eventId: event.id, result: "VALID" } });
      const out = evaluateScan(rt, ruleEvent, prior, scannedAt, entrance?.zoneId ?? null);
      const label = `${initialsOf(ticket.firstName, ticket.lastName)} · ${ticket.type.name}`;
      return { result: out.result, reason: "reason" in out ? out.reason : null, reentry: out.result === "VALID" && out.reentry, ticketId: ticket.id, codeHash: null, holderLabel: label };
    };
  } else {
    const hash = codeHash(input.code);
    lockKey = `f:${hash}:${event.id}`;
    const ext = event.externalId ? await externalTicket(event.externalId, input.code, hash) : { found: null as null, unreachable: false };
    decide = async (tx) => {
      const mk = (result: Decision["result"], reason: ScanReason | null, label: string | null = null): Decision => ({ result, reason, reentry: false, ticketId: null, codeHash: hash, holderLabel: label });
      if (!event.externalId) return mk("INVALID", "WRONG_EVENT");
      if (!ext.found) return mk("INVALID", "NOT_FOUND", ext.unreachable ? "Fullhouse niet bereikbaar" : null);
      const f = ext.found;
      const label = [f.holderLabel, f.ticketName].filter(Boolean).join(" · ") || null;
      if (f.eventExtId !== event.externalId) return mk("INVALID", "WRONG_EVENT", label);
      if (event.status === "CANCELLED") return mk("INVALID", "EVENT_NOT_ACTIVE", label);
      // Alleen VALID geeft toegang (vivenu); al het andere wordt geweigerd.
      if (f.status !== "VALID") return mk("INVALID", f.status === "INVALID" ? "CANCELLED" : "BLOCKED", label ? `${label} (${f.status})` : f.status);
      const prior = await tx.ticketScan.count({ where: { codeHash: hash, eventId: event.id, result: "VALID" } });
      return prior > 0 ? mk("WARNING", "ALREADY_USED", label) : mk("VALID", null, label);
    };
  }

  try {
    const row = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        let d = await decide(tx);
        let overrideData: { overrideById: string; overrideBy: string; overrideReason: string } | null = null;
        if (input.override && d.result !== "VALID" && d.reason && !NOT_OVERRIDABLE.includes(d.reason)) {
          overrideData = { overrideById: actor.userId ?? actor.scannerId ?? "scanner", overrideBy: actor.name, overrideReason: input.override.reason };
          d = { ...d, result: "VALID" };
        }
        const created = await tx.ticketScan.create({ data: { ...base, result: d.result, reason: d.reason, reentry: d.reentry, ticketId: d.ticketId, codeHash: d.codeHash, holderLabel: d.holderLabel, ...(overrideData ?? {}) } });
        if (overrideData) {
          await ticketAuditTx(tx, { action: "scan.override", actor: { id: actor.userId ?? actor.scannerId, name: actor.name }, ticketId: d.ticketId, eventId: event.id, scannerId: actor.scannerId, entrance: entrance?.name, reason: overrideData.overrideReason, meta: { reason: d.reason, source } });
        }
        return created;
      },
      { timeout: 15_000, maxWait: 10_000 },
    );
    return rowToResponse(row, actor);
  } catch (error) {
    // Dezelfde scan twee keer tegelijk binnengekomen: geef de bestaande uitslag terug.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const again = await prisma.ticketScan.findUnique({ where: { clientId: input.clientId } });
      if (again) return rowToResponse(again, actor);
    }
    throw error;
  }
}

interface ExternalHit {
  eventExtId: string;
  status: string;
  ticketName: string | null;
  holderLabel: string | null;
}

/** Fullhouse-ticket uit de lokale kopie, anders realtime bij Fullhouse (alleen lezen) en daarna bewaard. */
async function externalTicket(eventExtId: string, code: string, hash: string): Promise<{ found: ExternalHit | null; unreachable: boolean }> {
  const cached = await prisma.ticketExternalTicket.findFirst({ where: { codeHash: hash, eventExtId } });
  if (cached) return { found: { eventExtId: cached.eventExtId, status: cached.status, ticketName: cached.ticketName, holderLabel: cached.holderLabel }, unreachable: false };
  try {
    const t = await ticketProvider().lookupBarcode(code.trim(), eventExtId);
    if (!t) return { found: null, unreachable: false };
    const holder = t.name ? initialsFromFullName(t.name) : null;
    await prisma.ticketExternalTicket.upsert({
      where: { eventExtId_externalId: { eventExtId: t.eventId, externalId: t.externalId } },
      create: { eventExtId: t.eventId, externalId: t.externalId, codeHash: hash, status: String(t.status), ticketName: t.ticketName, area: t.area, holderLabel: holder },
      update: { codeHash: hash, status: String(t.status), ticketName: t.ticketName, area: t.area, holderLabel: holder },
    });
    return { found: { eventExtId: t.eventId, status: String(t.status), ticketName: t.ticketName, holderLabel: holder }, unreachable: false };
  } catch (error) {
    if (error instanceof FullhouseError) return { found: null, unreachable: true };
    throw error;
  }
}

export function initialsFromFullName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return `${parts[0][0].toUpperCase()}.`;
  return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(" ")}`;
}

// ── Context, offline-cache en synchronisatie ──

const SCAN_WINDOW_BEFORE_MS = 12 * 3600000;
const SCAN_WINDOW_AFTER_MS = 6 * 3600000;

export async function scanContext(actor: ScanActor) {
  const now = Date.now();
  const [events, entrances] = await Promise.all([
    prisma.ticketEvent.findMany({
      // Ook concept- en afgesloten wedstrijden zijn te kiezen (niet afgelaste), van een week terug tot ruim een jaar vooruit (het hele seizoen).
      where: {
        status: { not: "CANCELLED" },
        // Seizoenspassen (titel met "seizoen") blijven altijd kiesbaar, ook als de datum voorbij is.
        OR: [
          { startsAt: { lte: new Date(now + 400 * 86_400_000) }, endsAt: { gte: new Date(now - 7 * 86_400_000) } },
          { title: { contains: "seizoen", mode: "insensitive" } },
        ],
      },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, status: true, startsAt: true, endsAt: true, source: true, externalId: true, allowReentry: true },
    }),
    prisma.ticketEntrance.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, zoneId: true } }),
  ]);
  return { actor: { name: actor.name, kind: actor.kind, canOverride: actor.canOverride, canSeeStats: actor.canSeeStats, entranceId: actor.entranceId }, events, entrances };
}

type EventRow = Parameters<typeof toRuleEvent>[0];

/** Actieve HHC-tickets die voor deze wedstrijd gelden (status, vervaldatum en geldigheidsregels). */
export async function coveringTickets(event: EventRow) {
  const ruleEvent = toRuleEvent(event);
  const tickets = await prisma.ticket.findMany({
    where: { status: "ACTIVE", anonymizedAt: null, OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] },
    select: { id: true, publicId: true, qrVersion: true, firstName: true, lastName: true, category: true, validityMode: true, validFrom: true, validUntil: true, seasonId: true, competitions: true, homeOnly: true, isSeasonCard: true, zoneId: true, type: { select: { name: true } }, links: { select: { eventId: true } } },
  });
  return tickets.filter((t) =>
    coversEvent(
      { status: "ACTIVE", validityMode: t.validityMode as ValidityMode, validFrom: t.validFrom, validUntil: t.validUntil, seasonId: t.seasonId, competitions: t.competitions, eventIds: t.links.map((l) => l.eventId), homeOnly: t.homeOnly, isSeasonCard: t.isSeasonCard, zoneId: t.zoneId },
      ruleEvent,
    ),
  );
}

/**
 * Lijst van tickets die voor deze wedstrijd geldig zijn, voor scannen zonder verbinding.
 * Alleen tijdens de wedstrijddag en alleen tickets die op dit moment bekend zijn. Zonder
 * persoonsgegevens: initialen en tickettype. De server controleert alles opnieuw bij het terugmelden.
 */
export async function offlineCache(eventId: string) {
  const event = await prisma.ticketEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new ApiError(404, "Wedstrijd niet gevonden.");
  const now = Date.now();
  // Altijd te laden voor elk gekozen duel (ook concept, afgesloten, seizoenspassen); alleen afgelaste duels niet.
  if (event.status === "CANCELLED") {
    throw new ApiError(400, "Voor een afgelaste wedstrijd is geen offline-lijst beschikbaar.");
  }
  const hhc = (await coveringTickets(event)).map((t) => ({ p: t.publicId, v: t.qrVersion, l: `${initialsOf(t.firstName, t.lastName)} · ${t.type.name}`, z: t.zoneId, r: t.isSeasonCard && event.allowReentry }));
  const external = event.externalId
    ? await prisma.ticketExternalTicket.findMany({ where: { eventExtId: event.externalId, status: "VALID" }, select: { codeHash: true, holderLabel: true, ticketName: true } })
    : [];
  const used = await prisma.ticketScan.findMany({ where: { eventId, result: "VALID" }, select: { ticketId: true, codeHash: true, scannedAt: true } });
  const pids = new Map((await prisma.ticket.findMany({ where: { id: { in: used.map((u) => u.ticketId).filter((x): x is string => !!x) } }, select: { id: true, publicId: true } })).map((t) => [t.id, t.publicId]));
  return {
    event: { id: event.id, title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, allowReentry: event.allowReentry },
    generatedAt: new Date().toISOString(),
    // Minstens 24 uur geldig vanaf het laden, en tot 6 uur na afloop van de wedstrijd als dat later is.
    expiresAt: new Date(Math.max(event.endsAt.getTime() + SCAN_WINDOW_AFTER_MS, now + 24 * 3600000)).toISOString(),
    hhc,
    fullhouse: external.map((e) => ({ h: e.codeHash, l: [e.holderLabel, e.ticketName].filter(Boolean).join(" · ") })),
    used: used.map((u) => ({ k: (u.ticketId && pids.get(u.ticketId)) || u.codeHash, at: u.scannedAt.toISOString() })),
  };
}

/** Offline gemaakte scans terugmelden, op volgorde van scannen; de server beoordeelt elke scan opnieuw. */
export async function syncScans(actor: ScanActor, raw: unknown) {
  const list = z.array(scanInputSchema).max(200).parse((raw as { scans?: unknown })?.scans);
  list.sort((a, b) => (a.scannedAt ?? "").localeCompare(b.scannedAt ?? ""));
  const results: { clientId: string; result: ScanResponse["result"]; reason: ScanReason | null }[] = [];
  for (const s of list) {
    try {
      const r = await processScan(actor, { ...s, offline: true });
      results.push({ clientId: s.clientId, result: r.result, reason: r.reason });
    } catch {
      // Een enkele fout (bv. verwijderde wedstrijd) mag de rest niet tegenhouden; het apparaat probeert hem later opnieuw.
    }
  }
  return { results };
}

// ── Aantallen en historie ──

export async function scanStats(eventId: string) {
  const [event, byResult, bySource, entrances, admitted, recent] = await Promise.all([
    prisma.ticketEvent.findUnique({ where: { id: eventId }, select: { id: true, title: true, startsAt: true, capacity: true } }),
    prisma.ticketScan.groupBy({ by: ["result"], where: { eventId }, _count: { _all: true } }),
    prisma.ticketScan.groupBy({ by: ["source"], where: { eventId, result: "VALID" }, _count: { _all: true } }),
    prisma.ticketScan.groupBy({ by: ["entranceId"], where: { eventId, result: "VALID" }, _count: { _all: true } }),
    prisma.ticketScan.findMany({ where: { eventId, result: "VALID", reentry: false }, select: { ticketId: true, codeHash: true }, distinct: ["ticketId", "codeHash"] }),
    prisma.ticketScan.findMany({ where: { eventId }, orderBy: { scannedAt: "desc" }, take: 25, include: { scanner: { select: { name: true } } } }),
  ]);
  if (!event) throw new ApiError(404, "Wedstrijd niet gevonden.");
  const names = new Map((await prisma.ticketEntrance.findMany({ select: { id: true, name: true } })).map((e) => [e.id, e.name]));
  const count = (r: string) => byResult.find((x) => x.result === r)?._count._all ?? 0;
  return {
    event,
    valid: count("VALID"),
    warnings: count("WARNING"),
    invalid: count("INVALID"),
    inside: admitted.length,
    bySource: bySource.map((s) => ({ source: s.source, count: s._count._all })),
    byEntrance: entrances.map((e) => ({ name: (e.entranceId && names.get(e.entranceId)) || "Zonder ingang", count: e._count._all })),
    recent: recent.map((r) => ({ id: r.id, at: r.scannedAt, result: r.result, reason: r.reason ? SCAN_REASON_LABELS[r.reason as ScanReason] : null, label: r.holderLabel, source: r.source, scanner: r.scanner?.name ?? null, entrance: (r.entranceId && names.get(r.entranceId)) || null, overridden: !!r.overrideById, offline: r.offline, note: r.note })),
  };
}

export async function scanHistory(opts: { eventId?: string; result?: string; page?: number }) {
  const where = { ...(opts.eventId ? { eventId: opts.eventId } : {}), ...(opts.result ? { result: opts.result } : {}) };
  const page = Math.max(1, opts.page ?? 1);
  const [total, rows] = await Promise.all([
    prisma.ticketScan.count({ where }),
    prisma.ticketScan.findMany({ where, orderBy: { scannedAt: "desc" }, skip: (page - 1) * 100, take: 100, include: { scanner: { select: { name: true } } } }),
  ]);
  const names = new Map((await prisma.ticketEntrance.findMany({ select: { id: true, name: true } })).map((e) => [e.id, e.name]));
  return {
    total,
    page,
    rows: rows.map((r) => ({ id: r.id, at: r.scannedAt, eventId: r.eventId, result: r.result, reason: r.reason ? SCAN_REASON_LABELS[r.reason as ScanReason] : null, label: r.holderLabel, source: r.source, scanner: r.scanner?.name ?? null, entrance: (r.entranceId && names.get(r.entranceId)) || null, overridden: !!r.overrideById, overrideReason: r.overrideReason, offline: r.offline, note: r.note, ticketId: r.ticketId })),
  };
}
