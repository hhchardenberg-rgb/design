import ical, { type VEvent } from "node-ical";

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
        description: toText(vevent.description),
      });
    }
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return options.limit ? events.slice(0, options.limit) : events;
}
