import { prisma } from "@/lib/prisma";
import { fetchUpcomingCalendarEvents } from "@/lib/calendar";

export interface MergedAgendaEvent {
  id: string; // stabiel binnen deze lijst: AgendaEvent.id, of anders het ICS-samengestelde id
  agendaEventId: string | null; // AgendaEvent.id in de database, indien aanwezig (uitgelicht of handmatig) — nodig om te kunnen bewerken/verwijderen
  source: "MANUAL" | "ICS";
  title: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date | null;
  isFullDay: boolean;
  highlighted: boolean;
}

/**
 * Combineert de live Google Agenda-koppeling met de door een beheerder
 * toegevoegde/uitgelichte agendapunten (AgendaEvent) tot één lijst.
 *
 * - MANUAL-agendapunten komen rechtstreeks uit de database.
 * - ICS-agendapunten komen uit de live feed; als een beheerder zo'n event
 *   heeft uitgelicht (AgendaEvent met source = ICS, gekoppeld via icsUid),
 *   wordt de "meer uitleg"-tekst en de highlighted-vlag daarvandaan gehaald
 *   — de tijd/titel/locatie blijven wel altijd afkomstig van de live feed,
 *   zodat een verplaatst of gewijzigd event nooit verouderd blijft staan.
 *
 * Als de ICS-feed niet bereikbaar is, wordt dat doorgegeven via `icsError`
 * zodat de aanroeper dit kan tonen zonder de handmatige agendapunten te
 * verbergen.
 */
export async function getMergedAgendaEvents(
  options: { from?: Date; to?: Date; limit?: number; onlyHighlighted?: boolean } = {}
): Promise<{ events: MergedAgendaEvent[]; icsError: boolean }> {
  const from = options.from ?? new Date();
  const to = options.to ?? new Date(from.getTime() + 1000 * 60 * 60 * 24 * 365);

  const [agendaEvents, icsResult] = await Promise.all([
    prisma.agendaEvent.findMany(),
    fetchUpcomingCalendarEvents({ from, to }).then(
      (events) => ({ events, error: false as const }),
      () => ({ events: [], error: true as const })
    ),
  ]);

  const icsHighlights = new Map(agendaEvents.filter((a) => a.source === "ICS" && a.icsUid).map((a) => [a.icsUid!, a]));

  const merged: MergedAgendaEvent[] = [];

  for (const event of icsResult.events) {
    const highlight = icsHighlights.get(event.id);
    merged.push({
      id: event.id,
      agendaEventId: highlight?.id ?? null,
      source: "ICS",
      title: event.title,
      description: highlight?.description ?? event.description,
      location: event.location,
      start: event.start,
      end: event.end,
      isFullDay: event.isFullDay,
      highlighted: highlight?.highlighted ?? false,
    });
  }

  for (const agendaEvent of agendaEvents) {
    if (agendaEvent.source !== "MANUAL") continue;
    if (agendaEvent.start < from || agendaEvent.start > to) continue;
    merged.push({
      id: agendaEvent.id,
      agendaEventId: agendaEvent.id,
      source: "MANUAL",
      title: agendaEvent.title,
      description: agendaEvent.description,
      location: agendaEvent.location,
      start: agendaEvent.start,
      end: agendaEvent.end,
      isFullDay: agendaEvent.isFullDay,
      highlighted: agendaEvent.highlighted,
    });
  }

  merged.sort((a, b) => a.start.getTime() - b.start.getTime());

  const filtered = options.onlyHighlighted ? merged.filter((e) => e.highlighted) : merged;
  return {
    events: options.limit ? filtered.slice(0, options.limit) : filtered,
    icsError: icsResult.error,
  };
}
