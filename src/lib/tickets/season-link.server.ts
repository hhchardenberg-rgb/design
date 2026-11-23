import { prisma } from "@/lib/prisma";

// Wedstrijden automatisch aan hun seizoen koppelen. Een seizoenskaart geldt voor de duels van zijn
// seizoen; een duel zonder seizoen (bijvoorbeeld net uit Fullhouse binnengekomen, of aangemaakt voordat
// het seizoen bestond) zou anders ten onrechte worden afgewezen. Een duel valt in een seizoen als de
// aftrap (in Nederlandse tijd) binnen de begin- en einddatum valt, en alleen als dat precies één seizoen is.

/** Kalenderdag in Nederlandse tijd als middernacht UTC (zo staan seizoensdatums in de database). */
export function amsterdamCalendarDay(d: Date): Date {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return new Date(`${day}T00:00:00.000Z`);
}

type SeasonRange = { id: string; startsOn: Date; endsOn: Date };

/** Het seizoen waarin deze aftrap valt, als dat er precies één is. Puur, dus testbaar. */
export function pickSeason(startsAt: Date, seasons: SeasonRange[]): string | null {
  const day = amsterdamCalendarDay(startsAt).getTime();
  const hits = seasons.filter((s) => s.startsOn.getTime() <= day && s.endsOn.getTime() >= day);
  return hits.length === 1 ? hits[0].id : null;
}

/** Seizoen waarin een datum valt, als er precies één is. */
export async function seasonForDate(d: Date): Promise<string | null> {
  const day = amsterdamCalendarDay(d);
  const rows = await prisma.ticketSeason.findMany({ where: { startsOn: { lte: day }, endsOn: { gte: day } }, select: { id: true } });
  return rows.length === 1 ? rows[0].id : null;
}

/**
 * Alle wedstrijden zonder seizoen die in precies één seizoen vallen, aan dat seizoen koppelen.
 * Veilig om vaak te draaien: er wordt alleen iets gedaan voor wedstrijden zonder seizoen.
 */
export async function linkEventsToSeasons(): Promise<{ linked: number }> {
  const events = await prisma.ticketEvent.findMany({ where: { seasonId: null }, select: { id: true, startsAt: true } });
  if (events.length === 0) return { linked: 0 };
  const seasons = await prisma.ticketSeason.findMany({ select: { id: true, startsOn: true, endsOn: true } });
  if (seasons.length === 0) return { linked: 0 };
  const bySeason = new Map<string, string[]>();
  for (const e of events) {
    const s = pickSeason(e.startsAt, seasons);
    if (s) bySeason.set(s, [...(bySeason.get(s) ?? []), e.id]);
  }
  let linked = 0;
  for (const [seasonId, ids] of bySeason) {
    const r = await prisma.ticketEvent.updateMany({ where: { id: { in: ids }, seasonId: null }, data: { seasonId } });
    linked += r.count;
  }
  return { linked };
}

/**
 * Seizoens- en periodetickets van vóór de tijdzone-correctie liepen tot 23:59:59 UTC (= 00:59 of 01:59 's nachts in
 * Nederland) en begonnen om 00:00 UTC. Zet ze eenmalig om naar het einde en begin van de dag in Nederlandse tijd.
 * Raakt alleen rijen met precies die oude tijd, dus na de eerste keer doet dit niets meer.
 */
export async function fixLegacyDayBounds(): Promise<{ until: number; from: number }> {
  const until = await prisma.$executeRaw`
    UPDATE "tickets_tickets"
    SET "validUntil" = ((("validUntil"::date + 1)::timestamp AT TIME ZONE 'Europe/Amsterdam') AT TIME ZONE 'UTC') - interval '1 millisecond'
    WHERE "validityMode" IN ('SEASON', 'RANGE') AND "validUntil" IS NOT NULL AND "validUntil"::time = time '23:59:59.999'`;
  const from = await prisma.$executeRaw`
    UPDATE "tickets_tickets"
    SET "validFrom" = (("validFrom"::date)::timestamp AT TIME ZONE 'Europe/Amsterdam') AT TIME ZONE 'UTC'
    WHERE "validityMode" IN ('SEASON', 'RANGE') AND "validFrom" IS NOT NULL AND "validFrom"::time = time '00:00:00'`;
  return { until, from };
}

/** Beide onderhoudstaken; fouten worden gelogd en nooit doorgegeven (een pagina of synchronisatie mag hier niet op stuklopen). */
export async function seasonMaintenance(): Promise<void> {
  try {
    await linkEventsToSeasons();
    await fixLegacyDayBounds();
  } catch (e) {
    console.error("[tickets] seizoensonderhoud mislukt", e instanceof Error ? e.message : e);
  }
}
