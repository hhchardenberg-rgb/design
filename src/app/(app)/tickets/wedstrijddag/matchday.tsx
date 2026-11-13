"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, errorText, PageTitle } from "@/components/tickets/parts";
import { formatDayTime } from "@/lib/date-format";

interface Overview {
  event: { id: string; title: string; startsAt: string; capacity: number | null };
  inside: number;
  capacity: number | null;
  valid: number;
  refused: number;
  expectedExternal: number;
  lastScanAt: string | null;
  zones: { name: string; count: number }[];
  entrances: { name: string; total: number; recent: number }[];
  timeline: { at: string; count: number }[];
  alerts: { id: string; level: "red" | "amber" | "info"; text: string; at: string | null }[];
  scanners: { name: string; lastSeenAt: string | null }[];
}

const TONE = { red: "border-destructive/50 bg-destructive/5", amber: "border-amber-400/60 bg-amber-50", info: "border-border" } as const;
const time = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });

export function Matchday({ events, defaultId, canCheckIn }: { events: { id: string; title: string; startsAt: string }[]; defaultId: string | null; canCheckIn: boolean }) {
  const toast = useStableToast();
  const [eventId, setEventId] = useState(defaultId ?? "");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      setData(await api<Overview>(`/api/tickets/matchday?eventId=${eventId}`));
      setError(null);
      setUpdated(new Date());
    } catch (e) {
      setError(errorText(e));
    }
  }, [eventId]);

  // Ververst zichzelf elke 10 seconden zolang het tabblad open is.
  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const pct = data?.capacity ? Math.min(100, Math.round((data.inside / data.capacity) * 100)) : null;
  const peak = Math.max(1, ...(data?.timeline.map((t) => t.count) ?? [1]));

  return (
    <div className="space-y-5">
      <PageTitle title="Wedstrijddag" description="Live overzicht van bezetting, ingangen en meldingen. Ververst zichzelf elke 10 seconden." />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-10 rounded-md border border-border bg-surface px-3" aria-label="Wedstrijd">
          {events.length === 0 && <option value="">Geen wedstrijden in de buurt</option>}
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} ({formatDayTime(e.startsAt)})
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Nu verversen
        </Button>
        {updated && <span className="text-xs text-muted-foreground">Bijgewerkt om {time(updated.toISOString())}</span>}
      </div>
      {error && <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-3xl font-bold tabular-nums">{data.inside}</p>
                <p className="text-xs text-muted-foreground">{data.capacity ? `Binnen van ${data.capacity}` : "Personen binnen"}</p>
                {pct !== null && (
                  <div className="mt-2 h-2 rounded bg-surface-muted" aria-label={`${pct}% van de capaciteit`}>
                    <div className={`h-2 rounded ${pct >= 100 ? "bg-destructive" : pct >= 90 ? "bg-amber-500" : "bg-hhc-orange"}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-3xl font-bold tabular-nums">{data.valid}</p>
                <p className="text-xs text-muted-foreground">Geldige scans</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-3xl font-bold tabular-nums">{data.refused}</p>
                <p className="text-xs text-muted-foreground">Afgewezen of waarschuwing</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-3xl font-bold tabular-nums">{data.expectedExternal}</p>
                <p className="text-xs text-muted-foreground">Geldige Fullhouse-tickets</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Meldingen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.alerts.length === 0 && <p className="text-muted-foreground">Geen bijzonderheden.</p>}
              {data.alerts.map((a) => (
                <p key={a.id} className={`rounded-md border p-2 ${TONE[a.level]}`}>
                  {a.at && <span className="mr-2 tabular-nums text-xs text-muted-foreground">{time(a.at)}</span>}
                  {a.text}
                </p>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bezetting per vak</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {data.zones.length === 0 && <p className="text-muted-foreground">Nog niemand binnen.</p>}
                {data.zones.map((z) => (
                  <p key={z.name} className="flex justify-between">
                    <span>{z.name}</span>
                    <b className="tabular-nums">{z.count}</b>
                  </p>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ingangen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {data.entrances.length === 0 && <p className="text-muted-foreground">Nog geen scans.</p>}
                {data.entrances.map((e) => (
                  <p key={e.name} className="flex justify-between gap-3">
                    <span>{e.name}</span>
                    <span>
                      <b className="tabular-nums">{e.total}</b> <span className="text-xs text-muted-foreground">({e.recent} laatste 15 min)</span>
                    </span>
                  </p>
                ))}
                {data.scanners.length > 0 && (
                  <p className="pt-2 text-xs text-muted-foreground">
                    Scanners: {data.scanners.map((s) => `${s.name}${s.lastSeenAt ? ` (${time(s.lastSeenAt)})` : ""}`).join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Binnenkomst per kwartier</CardTitle>
            </CardHeader>
            <CardContent>
              {data.timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen geldige scans.</p>
              ) : (
                <div className="flex h-28 items-end gap-1" role="img" aria-label="Aantal geldige scans per kwartier">
                  {data.timeline.map((t) => (
                    <div key={t.at} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${time(t.at)}: ${t.count}`}>
                      <span className="text-[10px] tabular-nums">{t.count}</span>
                      <div className="w-full rounded-t bg-hhc-orange" style={{ height: `${Math.max(4, (t.count / peak) * 80)}px` }} />
                      <span className="text-[10px] text-muted-foreground">{time(t.at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {canCheckIn && eventId && <ManualCheckIn eventId={eventId} onDone={() => void load()} toast={toast} />}
    </div>
  );
}

function ManualCheckIn({ eventId, onDone, toast }: { eventId: string; onDone: () => void; toast: ReturnType<typeof useStableToast> }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<{ id: string; publicId: string; name: string; type: string }[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function search() {
    try {
      setRows((await api<{ rows: typeof rows }>(`/api/tickets/matchday/search?q=${encodeURIComponent(q)}`)).rows);
    } catch (e) {
      toast.error(errorText(e));
    }
  }
  async function checkIn() {
    if (!pick) return;
    setBusy(true);
    try {
      const r = await api<{ result: string; label: string | null }>("/api/tickets/matchday/checkin", { body: { eventId, ticketId: pick, reason } });
      toast.success(`Ingecheckt${r.label ? `: ${r.label}` : ""}.`);
      setPick(null);
      setReason("");
      setRows([]);
      setQ("");
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
        <CardTitle className="text-base">Handmatig inchecken</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">Voor een bezoeker met een HHC-ticket die niet kan scannen, bijvoorbeeld door een lege telefoon. Dit wordt met je naam en reden vastgelegd en verschijnt bij de meldingen.</p>
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op naam, e-mail of ticketnummer" onKeyDown={(e) => e.key === "Enter" && void search()} />
          <Button variant="outline" onClick={() => void search()}>
            Zoeken
          </Button>
        </div>
        {rows.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rows.map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-center gap-2 p-2">
                  <input type="radio" name="pick" checked={pick === r.id} onChange={() => setPick(r.id)} />
                  <span>
                    {r.name} · {r.type} <span className="text-xs text-muted-foreground">{r.publicId}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {pick && (
          <div className="flex gap-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reden (verplicht)" />
            <Button disabled={busy || reason.trim().length < 3} onClick={() => void checkIn()}>
              {busy ? "Bezig…" : "Inchecken"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
