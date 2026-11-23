import { prisma } from "@/lib/prisma";
import { pickSeasonCard, SEASON_CARD_SOURCE_WHERE } from "./season-cards";

// Database-kant van Fullhouse-seizoenskaarten (zie season-cards.ts). Alleen lezen uit de lokale kopie;
// realtime opzoeken bij Fullhouse gaat via de functie die de scanner meegeeft.

export type SeasonCardSource = {
  id: string;
  externalId: string;
  seasonId: string | null;
  seasonName: string | null;
};

/** Fullhouse-evenementen met seizoenskaarten of -passen, eventueel alleen die van één seizoen. */
export async function seasonCardSources(
  seasonId?: string | null,
): Promise<SeasonCardSource[]> {
  const rows = await prisma.ticketEvent.findMany({
    where: {
      ...SEASON_CARD_SOURCE_WHERE,
      ...(seasonId !== undefined ? { seasonId } : {}),
    },
    select: {
      id: true,
      externalId: true,
      seasonId: true,
      season: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    externalId: r.externalId!,
    seasonId: r.seasonId,
    seasonName: r.season?.name ?? null,
  }));
}

/** Geldige Fullhouse-seizoenskaarten van een seizoen (initialen, soort, vak, hash van de barcode). */
export async function fullhouseSeasonCards(seasonId: string) {
  const sources = await seasonCardSources(seasonId);
  if (!sources.length) return [];
  return prisma.ticketExternalTicket.findMany({
    where: {
      eventExtId: { in: sources.map((s) => s.externalId) },
      status: "VALID",
    },
    orderBy: [{ holderLabel: "asc" }, { id: "asc" }],
    select: {
      id: true,
      codeHash: true,
      holderLabel: true,
      ticketName: true,
      area: true,
      soldAt: true,
      eventExtId: true,
    },
  });
}

export type SeasonCardHit = {
  eventExtId: string;
  status: string;
  ticketName: string | null;
  holderLabel: string | null;
  area: string | null;
  seasonId: string | null;
  seasonName: string | null;
};
type Lookup = (
  eventExtId: string,
) => Promise<{
  found: {
    eventExtId: string;
    status: string;
    ticketName: string | null;
    holderLabel: string | null;
    area: string | null;
  } | null;
  unreachable: boolean;
}>;

/**
 * Is deze barcode een Fullhouse-seizoenskaart? Eerst in de lokale kopie (alle seizoenen, zodat een kaart van
 * een ander seizoen een duidelijke reden krijgt), anders realtime bij Fullhouse voor het seizoen van het duel.
 */
export async function findFullhouseSeasonCard(
  hash: string,
  seasonId: string | null,
  lookup: Lookup | null,
): Promise<SeasonCardHit | null> {
  const sources = await seasonCardSources();
  if (!sources.length) return null;
  const byExt = new Map(sources.map((s) => [s.externalId, s]));
  const local = await prisma.ticketExternalTicket.findMany({
    where: { codeHash: hash, eventExtId: { in: [...byExt.keys()] } },
    select: {
      eventExtId: true,
      status: true,
      ticketName: true,
      holderLabel: true,
      area: true,
    },
  });
  const hits = local.map((t) => ({
    ...t,
    seasonId: byExt.get(t.eventExtId)!.seasonId,
    seasonName: byExt.get(t.eventExtId)!.seasonName,
  }));
  const best = pickSeasonCard(hits, seasonId);
  if (best || !lookup || !seasonId) return best;
  for (const s of sources.filter((x) => x.seasonId === seasonId)) {
    const r = await lookup(s.externalId);
    if (r.found && r.found.eventExtId === s.externalId)
      return { ...r.found, seasonId: s.seasonId, seasonName: s.seasonName };
  }
  return null;
}

/** Bij een seizoensevenement zonder verkoopmomenten eenmalig alles ophalen, zodat "pas nog niet gekocht" klopt. */
export async function needsSoldAtBackfill(
  eventExtId: string,
): Promise<boolean> {
  const source = await prisma.ticketEvent.findFirst({
    where: { ...SEASON_CARD_SOURCE_WHERE, externalId: eventExtId },
    select: { id: true },
  });
  if (!source) return false;
  // Een volledige ronde zet syncedAt van elk ticket op dat moment; daarna triggert dit dus niet nog eens (ook niet als Fullhouse geen datum geeft).
  const last = await prisma.ticketSyncRun.findFirst({
    where: { kind: "tickets", eventExtId, status: "OK" },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });
  if (!last) return false;
  return !!(await prisma.ticketExternalTicket.findFirst({
    where: {
      eventExtId,
      status: "VALID",
      soldAt: null,
      syncedAt: { lt: last.startedAt },
    },
    select: { id: true },
  }));
}
