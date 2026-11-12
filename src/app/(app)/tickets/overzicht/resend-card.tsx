"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, errorText } from "@/components/tickets/parts";
import { formatDayTime } from "@/lib/date-format";

/** Mails (opnieuw) versturen naar iedereen van een wedstrijd die nog geen mail kreeg. */
export function ResendCard() {
  const toast = useStableToast();
  const [events, setEvents] = useState<{ id: string; title: string; startsAt: string }[]>([]);
  const [eventId, setEventId] = useState("");
  const [count, setCount] = useState<{ total: number; unsent: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ events: { id: string; title: string; startsAt: string; endsAt: string; status: string }[] }>("/api/tickets/events").then(
      (c) => setEvents(c.events.filter((e) => e.status !== "CANCELLED" && new Date(e.endsAt) > new Date())),
      () => {},
    );
  }, []);
  useEffect(() => {
    setCount(null);
    if (eventId) api<{ total: number; unsent: number }>(`/api/tickets/send?eventId=${eventId}`).then(setCount, (e) => toast.error(errorText(e)));
  }, [eventId, toast]);

  async function send() {
    setBusy(true);
    try {
      const r = await api<{ sent: number; failed: number; remaining: number }>("/api/tickets/send", { body: { eventId } });
      toast.success(`${r.sent} verstuurd${r.failed ? `, ${r.failed} mislukt` : ""}${r.remaining ? `, nog ${r.remaining} te gaan: druk nogmaals` : ""}.`);
      setCount(await api(`/api/tickets/send?eventId=${eventId}`));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (events.length === 0) return null;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
        <span className="font-medium">Mails versturen per wedstrijd</span>
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-10 rounded-md border border-border bg-surface px-3" aria-label="Wedstrijd">
          <option value="">Kies een wedstrijd…</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} ({formatDayTime(e.startsAt)})
            </option>
          ))}
        </select>
        {count && (
          <>
            <span className="text-muted-foreground">
              {count.unsent} van {count.total} tickets hebben nog geen mail gehad.
            </span>
            <Button size="sm" disabled={busy || count.unsent === 0} onClick={() => void send()}>
              {busy ? "Bezig…" : "Verstuur naar wie nog niets kreeg"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
