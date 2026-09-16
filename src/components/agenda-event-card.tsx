"use client";

import { useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CLUB_TIME_ZONE } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export interface AgendaEventCardData {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string | null;
  isFullDay: boolean;
  highlighted: boolean;
}

// Klikbare agendakaart: toont tijd/titel, en — als er een locatie of
// toelichting is — klapt bij een klik open voor meer uitleg. Wordt gebruikt
// op zowel /kalender als de hub-homepage, zodat een uitgelicht event overal
// hetzelfde werkt.
export function AgendaEventCard({ event, showDate = false }: { event: AgendaEventCardData; showDate?: boolean }) {
  const [open, setOpen] = useState(false);
  const zonedStart = toZonedTime(new Date(event.start), CLUB_TIME_ZONE);
  const hasDetail = Boolean(event.description || event.location);

  return (
    <Card className={cn("overflow-hidden", event.highlighted && "border-hhc-orange")}>
      <button
        type="button"
        className="flex w-full flex-col gap-1 p-4 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        onClick={() => hasDetail && setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{event.title}</p>
          {showDate && (
            <span className="text-sm text-muted-foreground">
              {format(zonedStart, "d MMM", { locale: nl })}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className="w-fit">
            {event.isFullDay ? "Hele dag" : format(zonedStart, "HH:mm", { locale: nl })}
          </Badge>
          {hasDetail && (
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
          )}
        </div>
      </button>
      {open && hasDetail && (
        <div className="flex flex-col gap-1 px-4 pb-4 text-sm text-muted-foreground">
          {event.location && (
            <p>
              <span className="font-medium text-foreground">Locatie:</span> {event.location}
            </p>
          )}
          {event.description && <p className="whitespace-pre-wrap">{event.description}</p>}
        </div>
      )}
    </Card>
  );
}
