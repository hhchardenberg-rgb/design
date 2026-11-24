import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAudit } from "./audit.server";
import type { TicketsActor } from "./authz.server";
import { amsterdamStartOfDay, computeValidUntil, defaultEndsAt, type ValidityMode } from "./rules";
import { linkEventsToSeasons, seasonForDate } from "./season-link.server";
import { eventSchema, fullhouseEventSchema, removeEventSchema, seasonSchema, typeSchema, zoneSchema } from "./schemas";

// Inrichting van Tickets: seizoenen, vakken, wedstrijden en tickettypes.

const actorOf = (a: TicketsActor) => ({ id: a.id, name: a.name });

function unique(e: unknown, message: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ApiError(409, message);
  throw e;
}

const asDay = (v: string) => new Date(`${v}T00:00:00.000Z`);

// --- Seizoenen ------------------------------------------------------------------

export async function listSeasons() {
  return prisma.ticketSeason.findMany({ orderBy: { startsOn: "desc" } });
}

export async function saveSeason(actor: TicketsActor, id: string | null, raw: unknown) {
  const input = seasonSchema.parse(raw);
  const data = { name: input.name, startsOn: asDay(input.startsOn), endsOn: asDay(input.endsOn) };
  try {
    const row = id
      ? await prisma.$transaction(async (tx) => {
          const updated = await tx.ticketSeason.update({ where: { id }, data });
          // Seizoenskaarten gelden van begin tot einde van het seizoen: een gecorrigeerde datum loopt mee.
          await tx.ticket.updateMany({
            where: { seasonId: id, validityMode: "SEASON" },
            data: { validFrom: amsterdamStartOfDay(updated.startsOn), validUntil: computeValidUntil("SEASON", { events: [], seasonEndsOn: updated.endsOn }) },
          });
          return updated;
        })
      : await prisma.ticketSeason.create({ data });
    // Duels zonder seizoen die in dit (nieuwe of verschoven) seizoen vallen, horen er nu bij: seizoenskaarten gelden er direct voor.
    await linkEventsToSeasons();
    await ticketAudit({ action: "season.saved", actor: actorOf(actor), meta: { seasonId: row.id } });
    return row;
  } catch (e) {
    unique(e, "Er bestaat al een seizoen met deze naam.");
  }
}

// --- Vakken -----------------------------------------------------------------------

export async function listZones() {
  return prisma.ticketZone.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

export async function saveZone(actor: TicketsActor, id: string | null, raw: unknown) {
  const input = zoneSchema.parse(raw);
  try {
    const row = id ? await prisma.ticketZone.update({ where: { id }, data: input }) : await prisma.ticketZone.create({ data: input });
    await ticketAudit({ action: "zone.saved", actor: actorOf(actor), meta: { zoneId: row.id } });
    return row;
  } catch (e) {
    unique(e, "Er bestaat al een vak met deze naam.");
  }
}

// --- Wedstrijden --------------------------------------------------------------------

export async function listEvents(opts: { includePast?: boolean; archived?: boolean } = {}) {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const rows = await prisma.ticketEvent.findMany({
    where: opts.archived ? { archivedAt: { not: null } } : { archivedAt: null, ...(opts.includePast ? {} : { OR: [{ endsAt: { gte: since } }, { status: { in: ["DRAFT", "ACTIVE"] } }] }) },
    orderBy: { startsAt: opts.archived ? "desc" : "asc" },
    include: { season: { select: { name: true } }, _count: { select: { links: true } } },
  });
  return rows.map((e) => ({ ...e, linkedTickets: e._count.links }));
}

async function checkSeason(seasonId: string | null) {
  if (seasonId && !(await prisma.ticketSeason.findUnique({ where: { id: seasonId }, select: { id: true } }))) throw new ApiError(400, "Het gekozen seizoen bestaat niet (meer).");
}


/** Vervaldatum van gekoppelde tickets (één of meer wedstrijden) opnieuw bepalen na een gewijzigd einde. */
export async function syncLinkedValidity(tx: Prisma.TransactionClient, eventId: string) {
  const linked = await tx.ticket.findMany({
    where: { validityMode: { in: ["SINGLE", "MULTI"] }, links: { some: { eventId } } },
    select: { id: true, validityMode: true, links: { select: { event: { select: { endsAt: true } } } } },
  });
  for (const t of linked) {
    await tx.ticket.update({ where: { id: t.id }, data: { validUntil: computeValidUntil(t.validityMode as ValidityMode, { events: t.links.map((l) => l.event) }) } });
  }
}

export async function saveEvent(actor: TicketsActor, id: string | null, raw: unknown) {
  const input = eventSchema.parse(raw);
  await checkSeason(input.seasonId);
  if (input.matchId && !(await prisma.match.findUnique({ where: { id: input.matchId }, select: { id: true } }))) throw new ApiError(400, "De gekoppelde wedstrijd uit de designtool bestaat niet (meer).");
  const startsAt = new Date(input.startsAt);
  const data = {
    title: input.title,
    opponent: input.opponent,
    competition: input.competition,
    isHome: input.isHome,
    location: input.location,
    startsAt,
    endsAt: input.endsAt ? new Date(input.endsAt) : defaultEndsAt(startsAt),
    seasonId: input.seasonId ?? (await seasonForDate(startsAt)),
    status: input.status,
    allowReentry: input.allowReentry,
    excludeSeasonCards: input.excludeSeasonCards,
    capacity: input.capacity ?? null,
    matchId: input.matchId,
  };
  if (id) {
    const before = await prisma.ticketEvent.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Wedstrijd niet gevonden.");
    if (before.source === "FULLHOUSE") throw new ApiError(400, "Een Fullhouse-evenement wijzig je in Fullhouse; hier kun je alleen de status, het seizoen, de capaciteit, herintrede en de toegang voor seizoenskaarten instellen.");
    if (before.archivedAt) throw new ApiError(400, "Deze wedstrijd is gearchiveerd. Zet hem eerst terug.");
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.ticketEvent.update({ where: { id }, data });
      // Tickets voor één of meer wedstrijden vervallen na het einde van hun laatste wedstrijd: dat einde loopt mee.
      if (updated.endsAt.getTime() !== before.endsAt.getTime()) await syncLinkedValidity(tx, id);
      return updated;
    });
    await ticketAudit({ action: "event.updated", actor: actorOf(actor), eventId: id, oldStatus: before.status, newStatus: row.status });
    return row;
  }
  const row = await prisma.ticketEvent.create({ data: { ...data, source: "HHC" } });
  await ticketAudit({ action: "event.created", actor: actorOf(actor), eventId: row.id, newStatus: row.status });
  return row;
}

/** Fullhouse-wedstrijd: alleen wat de Hub zelf bepaalt (status, seizoen, capaciteit, herintrede). Titel en datum komen uit Fullhouse. */
export async function saveFullhouseEventSettings(actor: TicketsActor, id: string, raw: unknown) {
  const input = fullhouseEventSchema.parse(raw);
  const before = await prisma.ticketEvent.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Wedstrijd niet gevonden.");
  if (before.source !== "FULLHOUSE") throw new ApiError(400, "Dit is geen Fullhouse-wedstrijd.");
  if (before.archivedAt) throw new ApiError(400, "Deze wedstrijd is gearchiveerd. Zet hem eerst terug.");
  if (input.seasonId !== undefined) await checkSeason(input.seasonId);
  const row = await prisma.ticketEvent.update({
    where: { id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.seasonId !== undefined ? { seasonId: input.seasonId } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.allowReentry !== undefined ? { allowReentry: input.allowReentry } : {}),
      ...(input.excludeSeasonCards !== undefined ? { excludeSeasonCards: input.excludeSeasonCards } : {}),
      ...(input.seasonCardSource !== undefined ? { seasonCardSource: input.seasonCardSource } : {}),
    },
  });
  await ticketAudit({ action: "event.updated", actor: actorOf(actor), eventId: id, oldStatus: before.status, newStatus: row.status, summary: "Fullhouse-wedstrijd ingesteld" });
  return row;
}

/** Alle conceptwedstrijden (die nog niet voorbij zijn) in één keer op Actief zetten. */
export async function activateDrafts(actor: TicketsActor) {
  const rows = await prisma.ticketEvent.findMany({ where: { status: "DRAFT", archivedAt: null, endsAt: { gte: new Date() } }, select: { id: true } });
  if (rows.length) await prisma.ticketEvent.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "ACTIVE" } });
  for (const r of rows) await ticketAudit({ action: "event.updated", actor: actorOf(actor), eventId: r.id, oldStatus: "DRAFT", newStatus: "ACTIVE", summary: "Concept geactiveerd" });
  return { activated: rows.length };
}

/** Wat er aan een wedstrijd hangt; bepaalt of verwijderen kan of alleen archiveren. */
export async function eventUsage(id: string) {
  const ev = await prisma.ticketEvent.findUnique({ where: { id }, select: { id: true, title: true, source: true, status: true, endsAt: true, archivedAt: true, externalId: true } });
  if (!ev) throw new ApiError(404, "Wedstrijd niet gevonden.");
  const [tickets, activeTickets, scans, deliveries, promos, external] = await Promise.all([
    prisma.ticketEventLink.count({ where: { eventId: id } }),
    prisma.ticketEventLink.count({ where: { eventId: id, ticket: { status: "ACTIVE" } } }),
    prisma.ticketScan.count({ where: { eventId: id } }),
    prisma.ticketDelivery.count({ where: { eventId: id } }),
    prisma.ticketPromo.count({ where: { eventIds: { has: id } } }),
    ev.externalId ? prisma.ticketExternalTicket.count({ where: { eventExtId: ev.externalId } }) : Promise.resolve(0),
  ]);
  const over = ev.status === "CANCELLED" || ev.status === "CLOSED" || ev.endsAt < new Date();
  const canDelete = ev.source === "HHC" && tickets === 0 && scans === 0 && deliveries === 0;
  // Archiveren met geldige tickets kan pas als de wedstrijd voorbij, afgesloten of afgelast is: anders verdwijnt hij uit de scanner terwijl er nog mensen binnen moeten.
  const canArchive = !ev.archivedAt && (activeTickets === 0 || over);
  return {
    id: ev.id,
    title: ev.title,
    source: ev.source,
    archived: !!ev.archivedAt,
    tickets,
    activeTickets,
    scans,
    deliveries,
    promos,
    external,
    canDelete,
    canArchive,
    reason: canDelete
      ? null
      : ev.source === "FULLHOUSE"
        ? "Een Fullhouse-wedstrijd komt bij de volgende synchronisatie terug. Archiveer hem: dan blijft hij weg."
        : `Er hangen al ${[tickets && `${tickets} tickets`, scans && `${scans} scans`, deliveries && `${deliveries} verzonden mails`].filter(Boolean).join(", ")} aan deze wedstrijd. Die historie blijft bewaard, dus je kunt hem alleen archiveren.`,
    archiveBlocked: canArchive || ev.archivedAt ? null : `Er zijn nog ${activeTickets} geldige tickets voor deze wedstrijd. Gelast hem eerst af (houders krijgen dan bericht) of wacht tot hij gespeeld is.`,
  };
}

/** Verwijderen (alleen zonder tickets, scans of mails) of archiveren. De titel moet ter bevestiging worden overgetypt. */
export async function removeEvent(actor: TicketsActor, id: string, raw: unknown) {
  const input = removeEventSchema.parse(raw);
  const u = await eventUsage(id);
  if (input.confirmTitle.trim().toLowerCase() !== u.title.trim().toLowerCase()) throw new ApiError(400, "Typ de titel van de wedstrijd precies over om te bevestigen.");
  if (input.mode === "delete") {
    if (!u.canDelete) throw new ApiError(409, u.reason ?? "Deze wedstrijd kan niet worden verwijderd.");
    await prisma.$transaction(async (tx) => {
      // Actiecodes die alleen naar deze wedstrijd verwezen, houden een lege lijst; de verwijzing gaat eruit.
      const promos = await tx.ticketPromo.findMany({ where: { eventIds: { has: id } }, select: { id: true, eventIds: true } });
      for (const p of promos) await tx.ticketPromo.update({ where: { id: p.id }, data: { eventIds: p.eventIds.filter((e) => e !== id) } });
      await tx.ticketEvent.delete({ where: { id } });
    });
    await ticketAudit({ action: "event.deleted", actor: actorOf(actor), eventId: id, reason: input.reason ?? undefined, summary: `Wedstrijd verwijderd: ${u.title}` });
    return { deleted: true };
  }
  if (!u.canArchive) throw new ApiError(409, u.archiveBlocked ?? "Deze wedstrijd kan niet worden gearchiveerd.");
  await prisma.ticketEvent.update({ where: { id }, data: { archivedAt: new Date(), archivedBy: actor.name } });
  await ticketAudit({ action: "event.archived", actor: actorOf(actor), eventId: id, reason: input.reason ?? undefined, summary: `Wedstrijd gearchiveerd: ${u.title}` });
  return { archived: true };
}

export async function restoreEvent(actor: TicketsActor, id: string) {
  const ev = await prisma.ticketEvent.findUnique({ where: { id }, select: { archivedAt: true, title: true } });
  if (!ev) throw new ApiError(404, "Wedstrijd niet gevonden.");
  if (!ev.archivedAt) return { restored: false };
  await prisma.ticketEvent.update({ where: { id }, data: { archivedAt: null, archivedBy: null } });
  await ticketAudit({ action: "event.restored", actor: actorOf(actor), eventId: id, summary: `Wedstrijd teruggezet: ${ev.title}` });
  return { restored: true };
}

/** Wedstrijden uit de designtool om aan te koppelen (thuis, komende 6 maanden). */
export async function designtoolMatches() {
  const now = new Date();
  const rows = await prisma.match.findMany({
    where: { date: { gte: new Date(now.getTime() - 86_400_000), lte: new Date(now.getTime() + 183 * 86_400_000) } },
    orderBy: { date: "asc" },
    take: 100,
    include: { team: { select: { name: true } }, opponent: { select: { name: true } } },
  });
  return rows.map((m) => ({ id: m.id, date: m.date, isHome: m.isHome, competition: m.competition, team: m.team.name, opponent: m.opponent.name }));
}

// --- Tickettypes ----------------------------------------------------------------------

export async function listTypes() {
  return prisma.ticketType.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { season: { select: { name: true } }, zone: { select: { name: true } }, _count: { select: { tickets: true } } },
  });
}

export async function saveType(actor: TicketsActor, id: string | null, raw: unknown) {
  const input: z.infer<typeof typeSchema> = typeSchema.parse(raw);
  await checkSeason(input.seasonId);
  if (input.zoneId && !(await prisma.ticketZone.findUnique({ where: { id: input.zoneId }, select: { id: true } }))) throw new ApiError(400, "Het gekozen vak bestaat niet (meer).");
  if (input.category === "SEASON" && !input.isSeasonCard) input.isSeasonCard = true;
  if (input.validityMode === "RANGE" && input.validFrom && input.validUntil && input.validUntil < input.validFrom) throw new ApiError(400, "De einddatum moet na de begindatum liggen.");
  const data = {
    ...input,
    validFrom: input.validFrom ? asDay(input.validFrom) : null,
    validUntil: input.validUntil ? asDay(input.validUntil) : null,
  };
  try {
    const row = id ? await prisma.ticketType.update({ where: { id }, data }) : await prisma.ticketType.create({ data });
    await ticketAudit({ action: id ? "type.updated" : "type.created", actor: actorOf(actor), meta: { typeId: row.id } });
    return row;
  } catch (e) {
    unique(e, "Er bestaat al een tickettype met deze naam.");
  }
}
