import { format, isSameDay } from "date-fns";
import { nl } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchUpcomingCalendarEvents, type CalendarEvent } from "@/lib/calendar";

export const revalidate = 900; // 15 min — live agenda, maar niet bij elke paginaweergave opnieuw ophalen

function groupByDay(events: CalendarEvent[]) {
  const groups: { day: Date; events: CalendarEvent[] }[] = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (last && isSameDay(last.day, event.start)) {
      last.events.push(event);
    } else {
      groups.push({ day: event.start, events: [event] });
    }
  }
  return groups;
}

export default async function KalenderPage() {
  let events: CalendarEvent[] = [];
  let error: string | null = null;

  try {
    events = await fetchUpcomingCalendarEvents({ limit: 100 });
  } catch {
    error = "De agenda kon niet worden opgehaald. Probeer het later opnieuw.";
  }

  const groups = groupByDay(events);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Agenda</h1>
        <p className="mt-1 text-muted-foreground">
          Activiteiten en planning, live verbonden met de Google Agenda van HHC Hardenberg.
        </p>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!error && groups.length === 0 && (
        <p className="text-sm text-muted-foreground">Geen aankomende activiteiten gevonden.</p>
      )}

      {!error && groups.length > 0 && (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.day.toISOString()}>
              <p className="mb-2 text-sm font-semibold capitalize text-muted-foreground">
                {format(group.day, "EEEE d MMMM yyyy", { locale: nl })}
              </p>
              <div className="flex flex-col gap-2">
                {group.events.map((event) => (
                  <Card key={event.id}>
                    <CardContent className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div>
                        <p className="font-medium">{event.title}</p>
                        {event.location && <p className="text-sm text-muted-foreground">{event.location}</p>}
                      </div>
                      <Badge variant="outline" className="w-fit">
                        {event.isFullDay ? "Hele dag" : format(event.start, "HH:mm", { locale: nl })}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
