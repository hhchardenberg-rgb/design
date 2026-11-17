import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAudit, ticketAuditTx } from "./audit.server";
import { initialsOf } from "./issue";
import { ticketProvider } from "./fullhouse";
import { FullhouseError } from "./fullhouse/types";
import { coversEvent, evaluateScan, SCAN_REASON_LABELS, type RuleEvent, type RuleTicket, type ScanReason, type TicketStatus, type ValidityMode } from "./rules";
import type { ScanActor } from "./scanner-auth.server";
import { formatDay } from "@/lib/date-format";
import { detectSource, parseQrCode, qrCodeFor } from "./token";
import { isTestCode, TEST_CODES, TEST_DETAIL, TEST_LABEL } from "./offline-check";

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
  /** Vak van het ticket (HHC-vak of Fullhouse-gebied), als dat bekend is. */
  zone: string | null;
  /** Extra uitleg voor de steward, bijvoorbeeld voor welke wedstrijd of welk vak het ticket wel geldt. */
  detail: string | null;
  /** De scan is ingevoerd op ticketnummer in plaats van met de QR-code. */
  byNumber: boolean;
  /** Een vaste testcode: niets opgeslagen, telt nergens mee. */
  test?: boolean;
  at: string;
}

/** Een getypt ticketnummer (XXXX-XXXX-XXXX-XXXX, streepjes en spaties mogen) als ticketkenmerk, anders null. */
export function ticketNumberFrom(code: string): string | null {
  const n = code.replace(/[\s-]/g, "").toUpperCase();
  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(n) ? n : null;
}

const NOT_OVERRIDABLE: ScanReason[] = ["NOT_FOUND", "CANCELLED", "EVENT_NOT_ACTIVE", "OUTDATED"];
type Extras = { zone?: string | null; detail?: string | null; byNumber?: boolean };
export const codeHash = (code: string) => createHash("sha256").update(code.trim()).digest("hex");

const rowToResponse = async (row: { id: string; clientId: string; result: string; reason: string | null; reentry: boolean; overrideById: string | null; source: string; holderLabel: string | null; scannedAt: Date; eventId: string; ticketId: string | null; codeHash: string | null }, actor: ScanActor | null, extras: Extras = {}): Promise<ScanResponse> => {
  let previous: ScanResponse["previous"] = null;
  // Bij "al gebruikt" en bij herintrede: wanneer en waar dit ticket eerder binnenkwam.
  if (row.result === "WARNING" || row.reentry) {
    const prev = await prisma.ticketScan.findFirst({
      where: { eventId: row.eventId, result: "VALID", id: { not: row.id }, ...(row.ticketId ? { ticketId: row.ticketId } : { codeHash: row.codeHash }) },
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
    zone: extras.zone ?? null,
    detail: extras.detail ?? null,
    byNumber: !!extras.byNumber,
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

/**
 * Een getypt ticketnummer van een bestaand HHC-ticket wordt omgezet naar de actuele QR-code van dat ticket.
 * Alleen een supervisor mag dat: een nummer staat leesbaar op het ticket en controleert de QR-versie niet.
 * Bestaat er geen HHC-ticket met dat nummer, dan blijft de code ongewijzigd (bijvoorbeeld een Fullhouse-barcode).
 */
async function resolveTicketNumber(actor: ScanActor, input: ScanInput): Promise<{ input: ScanInput; byNumber: boolean }> {
  if (parseQrCode(input.code)) return { input, byNumber: false };
  const number = ticketNumberFrom(input.code);
  if (!number) return { input, byNumber: false };
  const t = await prisma.ticket.findUnique({ where: { publicId: number }, select: { publicId: true, qrVersion: true } });
  if (!t) return { input, byNumber: false };
  if (!actor.canOverride) throw new ApiError(403, "Inchecken op ticketnummer kan alleen een supervisor. Scan de QR-code of roep een supervisor.");
  const note = ["Ingevoerd op ticketnummer", input.note].filter(Boolean).join(" · ");
  return { input: { ...input, code: qrCodeFor(t.publicId, t.qrVersion), note }, byNumber: true };
}

/** Een vaste testcode: alleen een uitslag en een auditregel, geen scan, geen telling, geen echt ticket. */
async function testScan(actor: ScanActor, input: ScanInput): Promise<ScanResponse> {
  const code = input.code.trim().toUpperCase() as keyof typeof TEST_CODES;
  const down = TEST_CODES[code] === "PROVIDER_DOWN";
  if (input.override && !actor.canOverride) throw new ApiError(403, "Alleen een supervisor mag een scan overrulen.");
  const admitted = !down || !!input.override;
  // Een testcode voor een wedstrijd die niet bestaat geeft geen groen en laat geen auditregel met een onbestaand id achter.
  if (!(await prisma.ticketEvent.findUnique({ where: { id: input.eventId }, select: { id: true } }))) throw new ApiError(404, "Wedstrijd niet gevonden.");
  await ticketAudit({ action: "scan.test", actor: { id: actor.userId ?? actor.scannerId, name: actor.name }, eventId: input.eventId, scannerId: actor.scannerId, reason: input.override?.reason ?? null, summary: `Testcode ${code} gescand`, meta: { code, result: admitted ? "VALID" : "INVALID" } });
  return {
    scanId: `test-${input.clientId}`,
    clientId: input.clientId,
    result: admitted ? "VALID" : "INVALID",
    reason: admitted ? null : "PROVIDER_DOWN",
    reasonLabel: admitted ? null : SCAN_REASON_LABELS.PROVIDER_DOWN,
    reentry: false,
    overridden: down && !!input.override,
    source: "FULLHOUSE",
    eventId: input.eventId,
    label: TEST_LABEL,
    previous: null,
    overridable: down && !input.override && actor.canOverride,
    zone: null,
    detail: TEST_DETAIL,
    byNumber: false,
    test: true,
    at: new Date().toISOString(),
  };
}

export async function processScan(actor: ScanActor, raw: unknown): Promise<ScanResponse> {
  const parsed = scanInputSchema.parse(raw);
  if (isTestCode(parsed.code)) return testScan(actor, parsed);
  const existing = await prisma.ticketScan.findUnique({ where: { clientId: parsed.clientId } });
  if (existing) return rowToResponse(existing, actor);
  const { input, byNumber } = await resolveTicketNumber(actor, parsed);

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

  type Decision = { result: "VALID" | "WARNING" | "INVALID"; reason: ScanReason | null; reentry: boolean; ticketId: string | null; codeHash: string | null; holderLabel: string | null; zone?: string | null; detail?: string | null };
  let lockKey: string;
  let decide: (tx: Prisma.TransactionClient) => Promise<Decision>;

  if (source === "HHC") {
    const ref = parseQrCode(input.code);
    const ticket = ref
      ? await prisma.ticket.findUnique({ where: { publicId: ref.publicId }, include: { type: { select: { name: true } }, zone: { select: { name: true } }, links: { select: { eventId: true } } } })
      : null;
    const known = !!ticket && !ticket.anonymizedAt;
    const valid = known && ticket!.qrVersion === ref!.version;
    lockKey = valid ? `t:${ticket!.id}:${event.id}` : `x:${input.clientId}`;
    decide = async (tx) => {
      // Een oudere versie van een bestaand ticket (na opnieuw versturen of overdragen): duidelijk benoemen, niet "bestaat niet".
      // Zonder initialen: na een overdracht zijn dat die van de nieuwe houder.
      if (known && !valid) return { result: "INVALID", reason: "OUTDATED", reentry: false, ticketId: ticket!.id, codeHash: null, holderLabel: ticket!.type.name };
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
      const reason = "reason" in out ? out.reason : null;
      let detail: string | null = null;
      if (reason === "WRONG_ZONE" && ticket.zone) detail = `Dit ticket is voor vak ${ticket.zone.name}.`;
      if (reason === "WRONG_EVENT" && rt.eventIds.length) {
        const evs = await tx.ticketEvent.findMany({ where: { id: { in: rt.eventIds } }, orderBy: { startsAt: "asc" }, select: { title: true, startsAt: true }, take: 3 });
        if (evs.length) detail = `Geldig voor: ${evs.map((e) => `${e.title} (${formatDay(e.startsAt)})`).join(", ")}.`;
      }
      return { result: out.result, reason, reentry: out.result === "VALID" && out.reentry, ticketId: ticket.id, codeHash: null, holderLabel: label, zone: ticket.zone?.name ?? null, detail };
    };
  } else {
    const hash = codeHash(input.code);
    lockKey = `f:${hash}:${event.id}`;
    const ext = event.externalId ? await externalTicket(event.externalId, input.code, hash) : { found: null as null, unreachable: false };
    // Duel zonder Fullhouse-koppeling: is dit toch een echte Fullhouse-kaart (lokaal bekend of bij Fullhouse, alleen lezen)?
    const foreign = event.externalId ? false : !!(await prisma.ticketExternalTicket.findFirst({ where: { codeHash: hash }, select: { id: true } })) || !!(await ticketProvider().lookupBarcode(input.code.trim()).catch(() => null));
    decide = async (tx) => {
      const f = ext.found;
      const mk = (result: Decision["result"], reason: ScanReason | null, label: string | null = null): Decision => ({ result, reason, reentry: false, ticketId: null, codeHash: hash, holderLabel: label, zone: f?.area ?? null });
      // Duel zonder Fullhouse-koppeling: een bekende Fullhouse-kaart is "andere wedstrijd", al het andere (onzin, onbekend) "bestaat niet".
      if (!event.externalId) return foreign ? mk("INVALID", "WRONG_EVENT") : mk("INVALID", "NOT_FOUND");
      // Fullhouse onbereikbaar is iets anders dan "bestaat niet": een supervisor mag dan met reden toelaten.
      if (!f) {
        // Tijdens een storing wel kijken of deze barcode al (met overrule) is toegelaten: dan "al gebruikt", niet opnieuw "storing".
        if (ext.unreachable && (await tx.ticketScan.count({ where: { codeHash: hash, eventId: event.id, result: "VALID" } })) > 0) return mk("WARNING", "ALREADY_USED");
        return mk("INVALID", ext.unreachable ? "PROVIDER_DOWN" : "NOT_FOUND");
      }
      const label = [f.holderLabel, f.ticketName].filter(Boolean).join(" · ") || null;
      if (f.eventExtId !== event.externalId) return mk("INVALID", "WRONG_EVENT", label);
      if (event.status === "CANCELLED") return mk("INVALID", "EVENT_NOT_ACTIVE", label);
      // Alleen VALID geeft toegang (vivenu); al het andere wordt geweigerd.
      if (f.status !== "VALID") return mk("INVALID", f.status === "INVALID" ? "CANCELLED" : "BLOCKED", label);
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
        return { created, extras: { zone: d.zone, detail: d.detail, byNumber } };
      },
      { timeout: 15_000, maxWait: 10_000 },
    );
    return rowToResponse(row.created, actor, row.extras);
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
  area: string | null;
}

/** Fullhouse-ticket uit de lokale kopie, anders realtime bij Fullhouse (alleen lezen) en daarna bewaard. */
async function externalTicket(eventExtId: string, code: string, hash: string): Promise<{ found: ExternalHit | null; unreachable: boolean }> {
  const cached = await prisma.ticketExternalTicket.findFirst({ where: { codeHash: hash, eventExtId } });
  if (cached) return { found: { eventExtId: cached.eventExtId, status: cached.status, ticketName: cached.ticketName, holderLabel: cached.holderLabel, area: cached.area }, unreachable: false };
  try {
    const t = await ticketProvider().lookupBarcode(code.trim(), eventExtId);
    if (!t) return { found: null, unreachable: false };
    const holder = t.name ? initialsFromFullName(t.name) : null;
    await prisma.ticketExternalTicket.upsert({
      where: { eventExtId_externalId: { eventExtId: t.eventId, externalId: t.externalId } },
      create: { eventExtId: t.eventId, externalId: t.externalId, codeHash: hash, status: String(t.status), ticketName: t.ticketName, area: t.area, holderLabel: holder },
      update: { codeHash: hash, status: String(t.status), ticketName: t.ticketName, area: t.area, holderLabel: holder },
    });
    return { found: { eventExtId: t.eventId, status: String(t.status), ticketName: t.ticketName, holderLabel: holder, area: t.area ?? null }, unreachable: false };
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

// ── Ongedaan maken ──

const UNDO_OWN_MINUTES = 10;
export const voidInputSchema = z.object({ scanId: z.string().min(1).max(40), reason: z.string().trim().min(3).max(300) });

/**
 * Een geldige scan ongedaan maken, bijvoorbeeld als iemand na "GELDIG" toch niet naar binnen ging of
 * het verkeerde ticket werd gescand. Het ticket telt daarna weer als ongebruikt. De scan blijft bewaard
 * (uitslag VOIDED) met wie, wanneer en waarom, en komt in het auditlog. Een supervisor mag elke scan
 * ongedaan maken; een gewone scanner alleen zijn eigen scan van de laatste 10 minuten.
 */
export async function voidScan(actor: ScanActor, raw: unknown) {
  const input = voidInputSchema.parse(raw);
  const row = await prisma.ticketScan.findUnique({ where: { id: input.scanId } });
  if (!row) throw new ApiError(404, "Scan niet gevonden.");
  if (row.result !== "VALID") throw new ApiError(400, row.result === "VOIDED" ? "Deze scan is al ongedaan gemaakt." : "Alleen een geldige scan kan ongedaan worden gemaakt.");
  const own = (actor.scannerId && row.scannerId === actor.scannerId) || (actor.userId && row.userId === actor.userId);
  const recent = Date.now() - row.receivedAt.getTime() <= UNDO_OWN_MINUTES * 60_000;
  if (!actor.canOverride && !(own && recent)) throw new ApiError(403, `Je kunt alleen je eigen scan van de laatste ${UNDO_OWN_MINUTES} minuten ongedaan maken. Vraag een supervisor.`);
  await prisma.$transaction(async (tx) => {
    const n = await tx.ticketScan.updateMany({ where: { id: row.id, result: "VALID" }, data: { result: "VOIDED", voidedAt: new Date(), voidedBy: actor.name, voidReason: input.reason } });
    if (n.count === 0) throw new ApiError(409, "Deze scan is net al gewijzigd.");
    await ticketAuditTx(tx, { action: "scan.void", actor: { id: actor.userId ?? actor.scannerId, name: actor.name }, ticketId: row.ticketId, eventId: row.eventId, scannerId: actor.scannerId, reason: input.reason, meta: { scanId: row.id, source: row.source, label: row.holderLabel } });
  });
  return { ok: true, scanId: row.id };
}

/**
 * Laatste geldige scans van alle toestellen voor de gekozen duels, zodat een supervisor in de scanner-app
 * ook andermans scan kan terugdraaien (via voidScan, met dezelfde regels). Alleen voor supervisors;
 * zonder persoonsgegevens: alleen het label van de scan (initialen en tickettype).
 */
export async function recentScansForSupervisor(actor: ScanActor, eventIds: string[]) {
  if (!actor.canOverride) throw new ApiError(403, "Alleen een supervisor ziet de scans van andere toestellen.");
  const ids = eventIds.filter((x) => x && x.length <= 40).slice(0, 10);
  if (!ids.length) return { scans: [] };
  const rows = await prisma.ticketScan.findMany({ where: { eventId: { in: ids }, result: "VALID" }, orderBy: { scannedAt: "desc" }, take: 15, include: { scanner: { select: { name: true } } } });
  return { scans: rows.map((r) => ({ scanId: r.id, at: r.scannedAt.toISOString(), label: r.holderLabel, scanner: r.scanner?.name ?? null, mine: !!((actor.scannerId && r.scannerId === actor.scannerId) || (actor.userId && r.userId === actor.userId)), eventId: r.eventId })) };
}

// ── Context, offline-cache en synchronisatie ──

const SCAN_WINDOW_AFTER_MS = 6 * 3600000;

export async function scanContext(actor: ScanActor) {
  const now = Date.now();
  const [events, entrances] = await Promise.all([
    prisma.ticketEvent.findMany({
      // Ook concept- en afgesloten wedstrijden zijn te kiezen (niet afgelaste), van een week terug tot ruim een jaar vooruit (het hele seizoen).
      where: {
        archivedAt: null,
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
/**
 * Tickets die voor deze wedstrijd gelden. Standaard alleen tickets die nu nog geldig zijn (scannen);
 * `includeExpired` telt ook tickets mee die inmiddels verlopen zijn (rapportages van gespeelde wedstrijden).
 */
export async function coveringTickets(event: EventRow, opts: { includeExpired?: boolean } = {}) {
  const ruleEvent = toRuleEvent(event);
  const tickets = await prisma.ticket.findMany({
    where: { status: "ACTIVE", anonymizedAt: null, ...(opts.includeExpired ? {} : { OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] }) },
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
  const results: { clientId: string; result: ScanResponse["result"]; reason: ScanReason | null; reasonLabel: string | null; label: string | null }[] = [];
  const rejected: { clientId: string; error: string }[] = [];
  for (const s of list) {
    try {
      const r = await processScan(actor, { ...s, offline: true });
      results.push({ clientId: s.clientId, result: r.result, reason: r.reason, reasonLabel: r.reasonLabel, label: r.label });
    } catch (error) {
      // Een blijvende fout (wedstrijd verwijderd, geen recht): niet eindeloos opnieuw proberen, maar melden.
      // Andere fouten (database even weg) mag het apparaat later opnieuw proberen.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429) rejected.push({ clientId: s.clientId, error: error.message });
    }
  }
  return { results, rejected };
}

// ── Aantallen en historie ──

const noteWithVoid = (r: { note: string | null; voidedBy: string | null; voidReason: string | null }) =>
  [r.note, r.voidReason ? `Ongedaan gemaakt door ${r.voidedBy ?? "onbekend"}: ${r.voidReason}` : null].filter(Boolean).join(" · ") || null;

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
    recent: recent.map((r) => ({ id: r.id, at: r.scannedAt, result: r.result, reason: r.reason ? SCAN_REASON_LABELS[r.reason as ScanReason] : null, label: r.holderLabel, source: r.source, scanner: r.scanner?.name ?? null, entrance: (r.entranceId && names.get(r.entranceId)) || null, overridden: !!r.overrideById, offline: r.offline, note: noteWithVoid(r) })),
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
    rows: rows.map((r) => ({ id: r.id, at: r.scannedAt, eventId: r.eventId, result: r.result, reason: r.reason ? SCAN_REASON_LABELS[r.reason as ScanReason] : null, label: r.holderLabel, source: r.source, scanner: r.scanner?.name ?? null, entrance: (r.entranceId && names.get(r.entranceId)) || null, overridden: !!r.overrideById, overrideReason: r.overrideReason, offline: r.offline, note: noteWithVoid(r), ticketId: r.ticketId })),
  };
}
