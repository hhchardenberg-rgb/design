import { format, isSameDay } from "date-fns";
import { nl } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { Card, CardContent } from "@/components/ui/card";
import { AgendaEventCard } from "@/components/agenda-event-card";
import { getMergedAgendaEvents, type MergedAgendaEvent } from "@/lib/agenda";
import { CLUB_TIME_ZONE } from "@/lib/timezone";

export const revalidate = 900; // 15 min — live agenda, maar niet bij elke paginaweergave opnieuw ophalen

function groupByDay(events: MergedAgendaEvent[]) {
  const groups: { day: Date; events: MergedAgendaEvent[] }[] = [];
  for (const event of events) {
    const zonedStart = toZonedTime(event.start, CLUB_TIME_ZONE);
    const last = groups[groups.length - 1];
    if (last && isSameDay(last.day, zonedStart)) {
      last.events.push(event);
    } else {
      groups.push({ day: zonedStart, events: [event] });
    }
  }
  return groups;
}

export default async function KalenderPage() {
  const { events, icsError } = await getMergedAgendaEvents({ limit: 150 });
  const groups = groupByDay(events);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Agenda</h1>
        <p className="mt-1 text-muted-foreground">
          Activiteiten en planning, live verbonden met de Google Agenda van HHC Hardenberg. Klik op een event voor
          meer uitleg.
        </p>
      </div>

      {icsError && (
        <Card className="border-destructive/40">
          <CardContent className="p-6 text-sm text-destructive">
            De live agenda kon niet worden opgehaald. Hieronder zie je alleen handmatig toegevoegde agendapunten.
          </CardContent>
        </Card>
      )}

      {groups.length === 0 && <p className="text-sm text-muted-foreground">Geen aankomende activiteiten gevonden.</p>}

      {groups.length > 0 && (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.day.toISOString()}>
              <p className="mb-2 text-sm font-semibold capitalize text-muted-foreground">
                {format(group.day, "EEEE d MMMM yyyy", { locale: nl })}
              </p>
              <div className="flex flex-col gap-2">
                {group.events.map((event) => (
                  <AgendaEventCard
                    key={event.id}
                    event={{
                      id: event.id,
                      title: event.title,
                      description: event.description,
                      location: event.location,
                      start: event.start.toISOString(),
                      end: event.end ? event.end.toISOString() : null,
                      isFullDay: event.isFullDay,
                      highlighted: event.highlighted,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
