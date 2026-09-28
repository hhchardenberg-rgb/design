import ical, { type VEvent } from "node-ical";

export { CLUB_TIME_ZONE } from "@/lib/timezone";

// Openbare Google Agenda van HHC Hardenberg (activiteiten-/planningsagenda),
// via de "basic.ics"-feed — geen authenticatie nodig, alleen leesrechten.
export const CLUB_CALENDAR_ICS_URL =
  "https://calendar.google.com/calendar/ical/46bkk9efhjo01glmcso26rnl8g%40group.calendar.google.com/public/basic.ics";

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date | null;
  isFullDay: boolean;
  location: string | null;
  description: string | null;
}

function toText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "val" in (value as Record<string, unknown>)) {
    return String((value as { val: unknown }).val);
  }
  return String(value);
}

// De KNVB-competitiekoppeling zet bij elke wedstrijd automatisch dezelfde
// standaardzinnen in de omschrijving (bv. "Tweede Divisie 2026/27.
// Aftraptijd volgens het bijgewerkte programma van HHC Hardenberg. Eindtijd
// technisch ingesteld op twee uur na de aftrap."). Die voegen niks toe voor
// vrijwilligers en worden er hier uitgefilterd; eventuele eigen toelichting
// van een beheerder blijft gewoon staan.
const BOILERPLATE_PATTERNS = [
  /^\S.*?\d{4}\/\d{2}\.\s*/, // "<Competitie> <seizoen>." aan het begin, bv. "Tweede Divisie 2026/27."
  /Aftraptijd volgens het bijgewerkte programma van [^.]+\.\s*/gi,
  /Eindtijd technisch ingesteld op twee uur na de aftrap\.\s*/gi,
];

function stripCompetitionBoilerplate(description: string | null): string | null {
  if (!description) return description;
  let result = description;
  for (const pattern of BOILERPLATE_PATTERNS) {
    result = result.replace(pattern, "");
  }
  result = result.trim();
  return result.length > 0 ? result : null;
}

export async function fetchUpcomingCalendarEvents(
  options: { from?: Date; to?: Date; limit?: number } = {}
): Promise<CalendarEvent[]> {
  const from = options.from ?? new Date();
  const to = options.to ?? new Date(from.getTime() + 1000 * 60 * 60 * 24 * 365);

  const data = await ical.async.fromURL(CLUB_CALENDAR_ICS_URL);

  const events: CalendarEvent[] = [];
  for (const component of Object.values(data)) {
    if (!component || typeof component !== "object" || (component as { type?: string }).type !== "VEVENT") continue;
    const vevent = component as VEvent;

    const instances = ical.expandRecurringEvent(vevent, { from, to });
    for (const instance of instances) {
      events.push({
        id: `${vevent.uid}-${instance.start.toISOString()}`,
        title: toText(instance.summary) ?? "Zonder titel",
        start: instance.start,
        end: instance.end ?? null,
        isFullDay: instance.isFullDay,
        location: toText(vevent.location),
        description: stripCompetitionBoilerplate(toText(vevent.description)),
      });
    }
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return options.limit ? events.slice(0, options.limit) : events;
}
