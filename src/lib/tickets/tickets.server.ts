import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAudit, ticketAuditData, ticketAuditTx } from "./audit.server";
import { need, type TicketsActor } from "./authz.server";
import { initialsOf, needsApproval, resolveValidity, type ResolvedValidity } from "./issue";
import { canTransition, displayStatus, type TicketStatus } from "./rules";
import { issueSchema, reissueSchema, statusChangeSchema, type HolderInput, type IssueInput } from "./schemas";
import { getTicketSettings } from "./settings.server";
import { newPublicId } from "./token";

// Interne HHC-tickets: uitgeven, overzicht, status en opnieuw uitgeven.

const actorOf = (a: TicketsActor) => ({ id: a.id, name: a.name });
const asDay = (v: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

export interface PreparedIssue {
  typeId: string;
  category: string;
  validity: ResolvedValidity;
  holders: HolderInput[];
}

/** Controleert een uitgifte volledig (type, wedstrijden, seizoen) zonder iets op te slaan. */
export async function prepareIssue(input: IssueInput): Promise<PreparedIssue> {
  const type = await prisma.ticketType.findUnique({ where: { id: input.typeId } });
  if (!type) throw new ApiError(400, "Het gekozen tickettype bestaat niet (meer).");
  const zoneId = input.zoneId ?? null;
  if (zoneId && !(await prisma.ticketZone.findFirst({ where: { id: zoneId, active: true }, select: { id: true } }))) throw new ApiError(400, "Het gekozen vak bestaat niet of is niet actief.");
  const seasonId = input.seasonId ?? type.seasonId;
  const [events, season] = await Promise.all([
    input.eventIds.length ? prisma.ticketEvent.findMany({ where: { id: { in: input.eventIds } }, select: { id: true, status: true, endsAt: true } }) : [],
    seasonId ? prisma.ticketSeason.findUnique({ where: { id: seasonId } }) : null,
  ]);
  const r = resolveValidity(
    type,
    { eventIds: input.eventIds, seasonId: input.seasonId ?? null, validFrom: asDay(input.validFrom), validUntil: asDay(input.validUntil), zoneId },
    { events, season },
    new Date(),
  );
  if (!r.ok) throw new ApiError(400, r.message);
  return { typeId: type.id, category: type.category, validity: r.value, holders: input.holders };
}

/** Maakt de tickets aan, in één transactie, met een auditregel per ticket. */
export async function createTickets(
  tx: Prisma.TransactionClient,
  actor: { id: string | null; name: string },
  p: PreparedIssue,
  opts: { batchId?: string | null; originSystem?: string | null } = {},
): Promise<string[]> {
  const v = p.validity;
  const rows = p.holders.map((h) => ({
    id: `tk_${randomUUID().replace(/-/g, "")}`,
    publicId: newPublicId(),
    firstName: h.firstName,
    lastName: h.lastName,
    email: h.email,
    phone: h.phone,
    company: h.company,
    relation: h.relation,
    note: h.note,
    category: p.category,
    typeId: p.typeId,
    zoneId: v.zoneId,
    validityMode: v.validityMode,
    seasonId: v.seasonId,
    competitions: v.competitions,
    homeOnly: v.homeOnly,
    isSeasonCard: v.isSeasonCard,
    validFrom: v.validFrom,
    validUntil: v.validUntil,
    issuedById: actor.id,
    issuedByName: actor.name,
    batchId: opts.batchId ?? null,
    originSystem: opts.originSystem ?? null,
  }));
  await tx.ticket.createMany({ data: rows });
  if (v.eventIds.length) await tx.ticketEventLink.createMany({ data: rows.flatMap((r) => v.eventIds.map((eventId) => ({ ticketId: r.id, eventId }))) });
  await tx.ticketAuditEvent.createMany({
    data: rows.map((r) =>
      ticketAuditData({
        action: "ticket.created",
        actor,
        ticketId: r.id,
        batchId: opts.batchId ?? null,
        eventId: v.eventIds.length === 1 ? v.eventIds[0] : null,
        newStatus: "ACTIVE",
        meta: { typeId: p.typeId, validityMode: v.validityMode, events: v.eventIds.length },
      }),
    ),
  });
  return rows.map((r) => r.id);
}

/**
 * Uitgeven vanuit het scherm "Tickets uitgeven". Eén ticket: direct. Meerdere: vereist
 * bulkrecht. Boven de drempel: er komt een bulkaanvraag die iemand anders moet goedkeuren.
 */
export async function issueTickets(actor: TicketsActor, raw: unknown, origin: "MANUAL" | "CSV" | "XLSX" | "LIST" = "MANUAL") {
  need(actor, "tickets:issue");
  const input = issueSchema.parse(raw);
  if (input.holders.length > 1) need(actor, "tickets:bulk");
  const prepared = await prepareIssue(input);
  const settings = await getTicketSettings();

  if (needsApproval(prepared.holders.length, settings.bulkApprovalThreshold)) {
    const batch = await prisma.$transaction(async (tx) => {
      const b = await tx.ticketBatch.create({
        data: {
          name: input.batchName || `Bulkuitgifte ${prepared.holders.length} tickets`,
          origin,
          status: "PENDING_APPROVAL",
          rowCount: prepared.holders.length,
          payload: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue,
          requestedById: actor.id,
          requestedBy: actor.name,
        },
      });
      await ticketAuditTx(tx, { action: "batch.requested", actor: actorOf(actor), batchId: b.id, newStatus: "PENDING_APPROVAL", meta: { count: b.rowCount } });
      return b;
    });
    return { pendingApproval: true, batchId: batch.id, count: prepared.holders.length, threshold: settings.bulkApprovalThreshold };
  }

  const ids = await prisma.$transaction(
    async (tx) => {
      let batchId: string | null = null;
      if (prepared.holders.length > 1) {
        const b = await tx.ticketBatch.create({
          data: {
            name: input.batchName || `Uitgifte ${prepared.holders.length} tickets`,
            origin,
            status: "ISSUED",
            rowCount: prepared.holders.length,
            requestedById: actor.id,
            requestedBy: actor.name,
            issuedAt: new Date(),
          },
        });
        batchId = b.id;
        await ticketAuditTx(tx, { action: "batch.issued", actor: actorOf(actor), batchId, newStatus: "ISSUED", meta: { count: b.rowCount } });
      }
      return createTickets(tx, actorOf(actor), prepared, { batchId });
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
  return { pendingApproval: false, ticketIds: ids, count: ids.length };
}

// --- Overzicht ------------------------------------------------------------------------

export interface TicketListQuery {
  q?: string;
  status?: string;
  typeId?: string;
  eventId?: string;
  category?: string;
  page?: number;
}

const PAGE = 50;

export async function listTickets(actor: TicketsActor, query: TicketListQuery) {
  const personal = actor.access.can("tickets:personal");
  const now = new Date();
  const where: Prisma.TicketWhereInput = { source: "HHC" };
  if (query.typeId) where.typeId = query.typeId;
  if (query.category) where.category = query.category;
  if (query.eventId) where.links = { some: { eventId: query.eventId } };
  if (query.status === "EXPIRED") Object.assign(where, { status: "ACTIVE", validUntil: { lt: now } });
  else if (query.status === "ACTIVE") Object.assign(where, { status: "ACTIVE", OR: [{ validUntil: null }, { validUntil: { gte: now } }] });
  else if (query.status === "BLOCKED" || query.status === "CANCELLED") where.status = query.status;
  const q = query.q?.trim();
  if (q) {
    // Zoeken op naam/e-mail/bedrijf alleen voor wie contactgegevens mag zien; anders alleen op ticketkenmerk.
    where.AND = personal
      ? [{ OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }, { publicId: { startsWith: q.toUpperCase() } }] }]
      : [{ publicId: { startsWith: q.toUpperCase() } }];
  }
  const page = Math.max(1, query.page ?? 1);
  const [total, rows] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { type: { select: { name: true } }, zone: { select: { name: true } }, links: { select: { event: { select: { id: true, title: true, startsAt: true } } } } },
    }),
  ]);
  return {
    total,
    page,
    pageSize: PAGE,
    personal,
    tickets: rows.map((t) => ({
      id: t.id,
      publicId: t.publicId,
      name: t.anonymizedAt ? "Geanonimiseerd" : personal ? `${t.firstName} ${t.lastName}` : initialsOf(t.firstName, t.lastName),
      email: personal && !t.anonymizedAt ? t.email : null,
      company: personal && !t.anonymizedAt ? t.company : null,
      category: t.category,
      type: t.type.name,
      zone: t.zone?.name ?? null,
      status: displayStatus({ status: t.status as TicketStatus, validUntil: t.validUntil }, now),
      validityMode: t.validityMode,
      validUntil: t.validUntil,
      events: t.links.map((l) => l.event),
      issuedBy: t.issuedByName,
      createdAt: t.createdAt,
    })),
  };
}

export async function getTicket(actor: TicketsActor, id: string) {
  const personal = actor.access.can("tickets:personal");
  const t = await prisma.ticket.findUnique({
    where: { id },
    include: {
      type: { select: { name: true } },
      zone: { select: { name: true } },
      season: { select: { name: true } },
      batch: { select: { id: true, name: true } },
      links: { select: { event: { select: { id: true, title: true, startsAt: true, status: true } } } },
    },
  });
  if (!t) throw new ApiError(404, "Ticket niet gevonden.");
  const history = await prisma.ticketAuditEvent.findMany({ where: { ticketId: id }, orderBy: { at: "desc" }, take: 50 });
  const hide = !personal || !!t.anonymizedAt;
  return {
    id: t.id,
    publicId: t.publicId,
    canSeePersonal: personal,
    firstName: hide ? null : t.firstName,
    lastName: hide ? null : t.lastName,
    displayName: t.anonymizedAt ? "Geanonimiseerd" : personal ? `${t.firstName} ${t.lastName}` : initialsOf(t.firstName, t.lastName),
    email: hide ? null : t.email,
    phone: hide ? null : t.phone,
    company: hide ? null : t.company,
    relation: hide ? null : t.relation,
    note: hide ? null : t.note,
    category: t.category,
    type: t.type.name,
    zone: t.zone?.name ?? null,
    season: t.season?.name ?? null,
    batch: t.batch,
    storedStatus: t.status,
    status: displayStatus({ status: t.status as TicketStatus, validUntil: t.validUntil }, new Date()),
    statusReason: t.statusReason,
    validityMode: t.validityMode,
    competitions: t.competitions,
    homeOnly: t.homeOnly,
    isSeasonCard: t.isSeasonCard,
    validFrom: t.validFrom,
    validUntil: t.validUntil,
    qrVersion: t.qrVersion,
    linkVersion: t.linkVersion,
    events: t.links.map((l) => l.event),
    issuedBy: t.issuedByName,
    createdAt: t.createdAt,
    anonymizedAt: t.anonymizedAt,
    history: history.map((h) => ({ id: h.id, at: h.at, action: h.action, summary: h.summary, actor: h.actorName, oldStatus: h.oldStatus, newStatus: h.newStatus, reason: h.reason })),
  };
}

const STATUS_ACTION = { BLOCKED: "ticket.blocked", CANCELLED: "ticket.cancelled", ACTIVE: "ticket.reactivated" } as const;

/** Blokkeren, annuleren of heractiveren; altijd met reden en in het auditlog. */
export async function changeStatus(actor: TicketsActor, id: string, raw: unknown) {
  need(actor, "tickets:block");
  const input = statusChangeSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id }, select: { id: true, status: true, validUntil: true, anonymizedAt: true } });
    if (!t) throw new ApiError(404, "Ticket niet gevonden.");
    const from = t.status as TicketStatus;
    if (!canTransition(from, input.status)) throw new ApiError(400, "Deze statuswijziging is niet mogelijk.");
    if (input.status === "ACTIVE" && t.validUntil && t.validUntil < new Date()) throw new ApiError(400, "Dit ticket is verlopen en kan niet opnieuw worden geactiveerd. Geef een nieuw ticket uit.");
    if (input.status === "ACTIVE" && t.anonymizedAt) throw new ApiError(400, "Een geanonimiseerd ticket kan niet opnieuw worden geactiveerd.");
    // Optimistische vergrendeling: alleen bijwerken als de status nog dezelfde is.
    const res = await tx.ticket.updateMany({ where: { id, status: from }, data: { status: input.status, statusReason: input.reason } });
    if (res.count !== 1) throw new ApiError(409, "Het ticket is intussen door iemand anders gewijzigd. Ververs de pagina.");
    await ticketAuditTx(tx, { action: STATUS_ACTION[input.status], actor: actorOf(actor), ticketId: id, oldStatus: from, newStatus: input.status, reason: input.reason });
    return { status: input.status };
  });
}

/** Opnieuw uitgeven: de QR of de link krijgt een nieuwe versie, de oude werkt direct niet meer. */
export async function reissue(actor: TicketsActor, id: string, raw: unknown) {
  need(actor, "tickets:resend");
  const input = reissueSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id }, select: { status: true, anonymizedAt: true } });
    if (!t) throw new ApiError(404, "Ticket niet gevonden.");
    if (t.anonymizedAt) throw new ApiError(400, "Een geanonimiseerd ticket kan niet opnieuw worden uitgegeven.");
    const row = await tx.ticket.update({
      where: { id },
      data: input.what === "qr" ? { qrVersion: { increment: 1 } } : { linkVersion: { increment: 1 } },
      select: { qrVersion: true, linkVersion: true },
    });
    await ticketAuditTx(tx, {
      action: input.what === "qr" ? "ticket.reissued" : "ticket.link_revoked",
      actor: actorOf(actor),
      ticketId: id,
      reason: input.reason,
      meta: input.what === "qr" ? { qrVersion: row.qrVersion } : { linkVersion: row.linkVersion },
    });
    return row;
  });
}

/** Persoonsgegevens wissen; type, wedstrijden en (later) scans blijven voor de totalen. */
export async function anonymize(actor: TicketsActor, id: string, reason: string) {
  need(actor, "tickets:anonymize");
  if (reason.trim().length < 3) throw new ApiError(400, "Geef een reden op (minstens 3 tekens).");
  return prisma.$transaction(async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id }, select: { anonymizedAt: true, status: true } });
    if (!t) throw new ApiError(404, "Ticket niet gevonden.");
    if (t.anonymizedAt) return { ok: true };
    await tx.ticket.update({
      where: { id },
      data: {
        firstName: "Geanonimiseerd",
        lastName: "",
        email: null,
        phone: null,
        company: null,
        relation: null,
        note: null,
        photoKey: null,
        anonymizedAt: new Date(),
        // Een ticket zonder houder mag nooit nog toegang geven.
        status: t.status === "ACTIVE" ? "CANCELLED" : t.status,
        statusReason: t.status === "ACTIVE" ? "Geanonimiseerd" : undefined,
        linkVersion: { increment: 1 },
        qrVersion: { increment: 1 },
      },
    });
    await ticketAuditTx(tx, { action: "ticket.anonymized", actor: actorOf(actor), ticketId: id, oldStatus: t.status, newStatus: t.status === "ACTIVE" ? "CANCELLED" : t.status, reason });
    return { ok: true };
  });
}

export { ticketAudit };
