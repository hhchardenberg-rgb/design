import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAudit } from "./audit.server";
import type { TicketsActor } from "./authz.server";
import { defaultEndsAt } from "./rules";
import { eventSchema, seasonSchema, typeSchema, zoneSchema } from "./schemas";

// Inrichting van HHC Tickets: seizoenen, vakken, wedstrijden en tickettypes.

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
    const row = id ? await prisma.ticketSeason.update({ where: { id }, data }) : await prisma.ticketSeason.create({ data });
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

export async function listEvents(opts: { includePast?: boolean } = {}) {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const rows = await prisma.ticketEvent.findMany({
    where: opts.includePast ? {} : { OR: [{ endsAt: { gte: since } }, { status: { in: ["DRAFT", "ACTIVE"] } }] },
    orderBy: { startsAt: "asc" },
    include: { season: { select: { name: true } }, _count: { select: { links: true } } },
  });
  return rows.map((e) => ({ ...e, linkedTickets: e._count.links }));
}

async function checkSeason(seasonId: string | null) {
  if (seasonId && !(await prisma.ticketSeason.findUnique({ where: { id: seasonId }, select: { id: true } }))) throw new ApiError(400, "Het gekozen seizoen bestaat niet (meer).");
}

/** Seizoen waarin een datum valt, als er precies één is. */
async function seasonForDate(d: Date): Promise<string | null> {
  const day = asDay(d.toISOString().slice(0, 10));
  const rows = await prisma.ticketSeason.findMany({ where: { startsOn: { lte: day }, endsOn: { gte: day } }, select: { id: true } });
  return rows.length === 1 ? rows[0].id : null;
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
    capacity: input.capacity ?? null,
    matchId: input.matchId,
  };
  if (id) {
    const before = await prisma.ticketEvent.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Wedstrijd niet gevonden.");
    if (before.source === "FULLHOUSE") throw new ApiError(400, "Een Fullhouse-evenement wijzig je in Fullhouse; hier kun je alleen zichtbaarheid en herintrede instellen.");
    const row = await prisma.ticketEvent.update({ where: { id }, data });
    await ticketAudit({ action: "event.updated", actor: actorOf(actor), eventId: id, oldStatus: before.status, newStatus: row.status });
    return row;
  }
  const row = await prisma.ticketEvent.create({ data: { ...data, source: "HHC" } });
  await ticketAudit({ action: "event.created", actor: actorOf(actor), eventId: row.id, newStatus: row.status });
  return row;
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
