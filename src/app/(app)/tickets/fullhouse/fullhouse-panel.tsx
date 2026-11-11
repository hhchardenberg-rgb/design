"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { formatDayTime } from "@/lib/date-format";
import { api, errorText, PageTitle } from "@/components/tickets/parts";

interface Overview {
  config: { mode: string; apiKey: boolean; accessToken: boolean; webhookSecret: boolean; baseUrl: string };
  provider: string;
  writesEnabled: boolean;
  events: { id: string; title: string; startsAt: string; status: string; externalId: string | null; counts: Record<string, number> }[];
  runs: { id: string; kind: string; eventExtId: string | null; status: string; mode: string; fetched: number; upserted: number; error: string | null; startedAt: string; finishedAt: string | null; startedBy: string | null }[];
}

export function FullhousePanel({ canManage }: { canManage: boolean }) {
  const toast = useStableToast();
  const [d, setD] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [diag, setDiag] = useState<{ mode: string; events: number | null; ticketKeys: string[]; note: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await api<Overview>("/api/tickets/fullhouse"));
    } catch (e) {
      toast.error(errorText(e));
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    try {
      toast.success(await fn());
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
      await load();
    }
  }

  if (!d) return <p className="text-sm text-muted-foreground">Laden…</p>;
  const mock = d.provider === "mock";
  return (
    <div className="space-y-6">
      <PageTitle title="Fullhouse" description="Evenementen, externe tickets en synchronisaties. Fullhouse blijft de bron; de Hub leest alleen en bewaart een controlekopie." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Koppeling</CardTitle>
          <CardDescription>
            {mock ? "Testmodus: er worden voorbeeldtickets gebruikt (FH-TEST-0001 t/m 0050). Er is geen echte koppeling." : `Verbonden in modus ${d.provider} via ${d.config.baseUrl}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Scanapparaat-token: <b>{d.config.accessToken ? "ingesteld" : "ontbreekt"}</b> · Webhooksleutel: <b>{d.config.webhookSecret ? "ingesteld" : "ontbreekt"}</b> · Schrijven naar Fullhouse: <b>{d.writesEnabled ? "aan" : "uit (alleen lezen)"}</b>
          </p>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("diag", async () => { const r = await api<NonNullable<typeof diag>>("/api/tickets/fullhouse/diagnose", { body: {} }); setDiag(r); return "Koppeling gecontroleerd."; })}>
                Controleer koppeling
              </Button>
              <Button size="sm" disabled={!!busy} onClick={() => run("events", async () => { const r = await api<{ fetched: number; created: number }>("/api/tickets/fullhouse/events", { body: {} }); return `${r.fetched} evenementen gelezen, ${r.created} nieuw (als concept).`; })}>
                Evenementen ophalen
              </Button>
            </div>
          )}
          {diag && (
            <div className="rounded-md border border-border p-3 text-xs">
              <p>Modus: {diag.mode} · evenementen gezien: {diag.events ?? "–"}</p>
              <p>Velden van een ticket (alleen namen): {diag.ticketKeys.length ? diag.ticketKeys.join(", ") : "geen ticket gezien"}</p>
              {diag.note && <p>{diag.note}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fullhouse-wedstrijden en externe tickets</CardTitle>
          <CardDescription>Opgehaalde wedstrijden staan als concept; activeer ze bij Wedstrijden om te kunnen scannen.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {d.events.length === 0 && <li className="py-2 text-sm text-muted-foreground">Nog geen Fullhouse-wedstrijden. Haal ze hierboven op.</li>}
            {d.events.map((e) => {
              const valid = e.counts.VALID ?? 0;
              const other = Object.entries(e.counts).filter(([k]) => k !== "VALID").reduce((n, [, v]) => n + v, 0);
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDayTime(e.startsAt)} · {valid} geldige externe tickets, {other} overig
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(e.id, async () => { const r = await api<{ fetched: number; full: boolean }>("/api/tickets/fullhouse/sync", { body: { eventId: e.id } }); return `${r.fetched} tickets ${r.full ? "volledig" : "bijgewerkt"} gesynchroniseerd.`; })}>
                        {busy === e.id ? "Bezig…" : "Synchroniseren"}
                      </Button>
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(e.id, async () => { const r = await api<{ fetched: number }>("/api/tickets/fullhouse/sync", { body: { eventId: e.id, full: true } }); return `${r.fetched} tickets volledig opnieuw ingelezen.`; })}>
                        Volledig opnieuw
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Synchronisaties</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Start</th>
                <th className="p-3">Soort</th>
                <th className="p-3">Uitkomst</th>
                <th className="p-3">Gelezen</th>
                <th className="p-3">Door</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {d.runs.map((r) => (
                <tr key={r.id}>
                  <td className="p-3 tabular-nums">{formatDayTime(r.startedAt)}</td>
                  <td className="p-3">{r.kind}</td>
                  <td className={`p-3 ${r.status === "FAILED" ? "text-destructive" : ""}`}>{r.status === "OK" ? "Gelukt" : r.status === "FAILED" ? `Mislukt: ${r.error ?? ""}` : "Bezig"}</td>
                  <td className="p-3">{r.fetched}</td>
                  <td className="p-3 text-muted-foreground">{r.startedBy ?? "–"}</td>
                </tr>
              ))}
              {d.runs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    Nog geen synchronisaties.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
