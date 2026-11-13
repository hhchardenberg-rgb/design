"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, errorText } from "@/components/tickets/parts";
import { formatDayTime } from "@/lib/date-format";

interface Detail {
  id: string;
  publicId: string;
  name: string;
  type: string;
  zone: string | null;
  status: string;
  games: { id: string; title: string; startsAt: string; past: boolean; attended: boolean; firstAt: string | null; entrance: string | null }[];
}

export function PassDetail({ id, canTransfer, canPersonal }: { id: string; canTransfer: boolean; canPersonal: boolean }) {
  const toast = useStableToast();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setD(await api<Detail>(`/api/tickets/seasonpasses/${id}`));
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);
  useEffect(() => void load(), [load]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!d) return <p className="text-sm text-muted-foreground">Laden…</p>;
  const past = d.games.filter((g) => g.past);
  const came = past.filter((g) => g.attended).length;
  return (
    <div className="space-y-5">
      <Link href="/tickets/seizoenspassen" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="h-4 w-4" /> Seizoenspassen
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{d.name}</h1>
        <p className="text-sm text-muted-foreground">
          {d.type}
          {d.zone ? ` · ${d.zone}` : ""} · {d.publicId} · geweest bij {came} van {past.length} gespeelde duels ·{" "}
          <Link className="underline" href={`/tickets/overzicht/${d.id}`}>
            Ticket openen
          </Link>
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gebruik per duel</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border text-sm">
            {d.games.length === 0 && <li className="p-4 text-muted-foreground">Geen duels voor deze pas in het seizoen.</li>}
            {d.games.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>
                  {g.title} <span className="text-xs text-muted-foreground">{formatDayTime(g.startsAt)}</span>
                </span>
                <span className={g.attended ? "font-medium text-success" : g.past ? "text-amber-600" : "text-muted-foreground"}>
                  {g.attended ? `Geweest${g.entrance ? ` · ${g.entrance}` : ""}${g.firstAt ? ` · ${formatDayTime(g.firstAt)}` : ""}` : g.past ? "Niet geweest" : "Nog te spelen"}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {canTransfer && d.status === "ACTIVE" && <Transfer id={d.id} canPersonal={canPersonal} toast={toast} onDone={() => void load()} />}
    </div>
  );
}

export function Transfer({ id, canPersonal, toast, onDone }: { id: string; canPersonal: boolean; toast: ReturnType<typeof useStableToast>; onDone: () => void }) {
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", reason: "", send: true });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  async function run() {
    if (!window.confirm("De oude QR-code en ticketlink werken hierna niet meer. Doorgaan met overdragen?")) return;
    setBusy(true);
    try {
      await api(`/api/tickets/tickets/${id}/transfer`, { body: { holder: { firstName: f.firstName, lastName: f.lastName, email: f.email }, reason: f.reason } });
      if (f.send && f.email.trim()) {
        try {
          await api(`/api/tickets/tickets/${id}/send`, { body: {} });
        } catch (e) {
          toast.error(`Overgedragen, maar mailen mislukte: ${errorText(e)}`);
        }
      }
      toast.success("Ticket overgedragen. De oude QR-code is ongeldig.");
      setF({ firstName: "", lastName: "", email: "", reason: "", send: true });
      onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Overdragen aan een andere houder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Het ticket komt op naam van de nieuwe houder, met een nieuwe QR-code en link. Het gebruik tot nu toe blijft bij het ticket.{canPersonal ? "" : " Je ziet de gegevens van de huidige houder niet."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="tr-fn">Voornaam</Label>
            <Input id="tr-fn" value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="tr-ln">Achternaam</Label>
            <Input id="tr-ln" value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="tr-em">E-mailadres</Label>
            <Input id="tr-em" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="tr-re">Reden</Label>
            <Input id="tr-re" value={f.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Bijvoorbeeld: pas overgenomen" />
          </div>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.send} onChange={(e) => set({ send: e.target.checked })} /> Nieuw ticket direct mailen
        </label>
        <Button disabled={busy || !f.firstName.trim() || !f.lastName.trim() || f.reason.trim().length < 3} onClick={() => void run()}>
          {busy ? "Bezig…" : "Overdragen"}
        </Button>
      </CardContent>
    </Card>
  );
}
