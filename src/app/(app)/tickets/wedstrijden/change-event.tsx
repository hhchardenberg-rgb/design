"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, errorText, fromLocalInput, toLocalInput } from "@/components/tickets/parts";

interface Result {
  dryRun: boolean;
  recipients: number;
  hhcTickets: number;
  fullhouseTickets: number;
  fullhouse: boolean;
  sent?: number;
  failed?: number;
  remaining?: number;
}

/** Afgelasten of verplaatsen in één klik: wedstrijd aanpassen, tickets laten meelopen en houders mailen. */
export function ChangeEvent({ event, canMail, onDone, onClose }: { event: { id: string; title: string; startsAt: string; status: string; source: string }; canMail: boolean; onDone: () => void; onClose: () => void }) {
  const toast = useStableToast();
  const [action, setAction] = useState<"MOVE" | "CANCEL">("MOVE");
  const [startsAt, setStartsAt] = useState(toLocalInput(event.startsAt));
  const [message, setMessage] = useState("");
  const [mail, setMail] = useState(canMail);
  const [preview, setPreview] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const body = (dryRun: boolean) => ({ action, ...(action === "MOVE" ? { startsAt: fromLocalInput(startsAt) } : {}), message: message || null, sendMail: mail, dryRun });

  async function check() {
    setBusy(true);
    try {
      setPreview(await api<Result>(`/api/tickets/events/${event.id}/change`, { body: body(true) }));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    try {
      const r = await api<Result>(`/api/tickets/events/${event.id}/change`, { body: body(false) });
      toast.success(`${action === "MOVE" ? "Verplaatst" : "Afgelast"}.${mail ? ` ${r.sent ?? 0} berichten verstuurd${r.failed ? `, ${r.failed} mislukt` : ""}.` : ""}`);
      setPreview(null);
      onClose();
      onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
        <div className="space-y-3 rounded-md border border-border p-3">
          <p className="font-medium">Afgelasten of verplaatsen</p>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input type="radio" checked={action === "MOVE"} onChange={() => { setAction("MOVE"); setPreview(null); }} /> Verplaatsen naar een nieuwe datum
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={action === "CANCEL"} onChange={() => { setAction("CANCEL"); setPreview(null); }} /> {event.status === "CANCELLED" ? "Afgelasten opnieuw uitvoeren (alleen openstaande berichten)" : "Afgelasten (nog geen nieuwe datum)"}
            </label>
          </div>
          {action === "MOVE" && (
            <div>
              <Label htmlFor={`mv-${event.id}`}>Nieuwe aftrap</Label>
              <Input id={`mv-${event.id}`} type="datetime-local" value={startsAt} onChange={(e) => { setStartsAt(e.target.value); setPreview(null); }} />
            </div>
          )}
          <div>
            <Label htmlFor={`msg-${event.id}`}>Toelichting in de mail (optioneel)</Label>
            <Input id={`msg-${event.id}`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Bijvoorbeeld: vanwege een onbespeelbaar veld" />
          </div>
          {canMail && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={mail} onChange={(e) => { setMail(e.target.checked); setPreview(null); }} /> Houders per e-mail informeren
            </label>
          )}
          {preview && (
            <p className="rounded-md bg-surface-muted p-2">
              {mail ? `${preview.recipients} mensen krijgen een mail. ` : "Er wordt geen mail verstuurd. "}
              {preview.hhcTickets} HHC-tickets blijven geldig{action === "MOVE" ? " voor de nieuwe datum" : " (ze worden pas bruikbaar als er een nieuwe datum is)"}.
              {preview.fullhouseTickets > 0 && ` ${preview.fullhouseTickets} Fullhouse-tickets worden niet door ons gemaild: informeer die kopers via Fullhouse${preview.fullhouse && action === "MOVE" ? " en pas daar ook de datum aan" : ""}.`}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy || (action === "MOVE" && !startsAt)} onClick={() => void check()}>
              Eerst controleren
            </Button>
            <Button size="sm" disabled={busy || !preview} onClick={() => void confirm()}>
              {busy ? "Bezig…" : action === "MOVE" ? "Verplaatsen" : "Afgelasten"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Annuleren
            </Button>
          </div>
        </div>
  );
}
