"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { formatDayTime } from "@/lib/date-format";
import { api, errorText, PageTitle } from "@/components/tickets/parts";

interface Scanner {
  id: string;
  name: string;
  loginCode: string;
  supervisor: boolean;
  active: boolean;
  entranceId: string | null;
  entrance: string | null;
  lastSeenAt: string | null;
  locked: boolean;
}
interface Entrance {
  id: string;
  name: string;
  zoneId: string | null;
  active: boolean;
}
interface Data {
  scanners: Scanner[];
  entrances: Entrance[];
  zones: { id: string; name: string }[];
}

export function ScannersManager() {
  const toast = useStableToast();
  const [d, setD] = useState<Data | null>(null);
  const [name, setName] = useState("");
  const [supervisor, setSupervisor] = useState(false);
  const [entranceId, setEntranceId] = useState("");
  const [eName, setEName] = useState("");
  const [eZone, setEZone] = useState("");
  const [secret, setSecret] = useState<{ name: string; loginCode: string; pin: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setD(await api<Data>("/api/tickets/scanners"));
    } catch (e) {
      toast.error(errorText(e));
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <p className="text-sm text-muted-foreground">Laden…</p>;
  return (
    <div className="space-y-6">
      <PageTitle title="Scannerbeheer" description="Scanners loggen in met een code en PIN, zonder Hub-account. Beheerders met scanrechten gebruiken hun eigen account." />
      <p className="text-sm">
        De scanner staat op <a className="font-medium underline" href="/scan" target="_blank" rel="noreferrer">/scan</a>. Open die pagina op de telefoon en kies “Zet op beginscherm”.
      </p>

      {secret && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base">Inloggegevens van {secret.name}</CardTitle>
            <CardDescription>De PIN wordt maar één keer getoond. Noteer hem nu en geef hem aan de scanner.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-mono text-lg">
              Code {secret.loginCode} · PIN {secret.pin}
            </p>
            <Button size="sm" variant="outline" onClick={() => setSecret(null)}>
              Gelezen, sluiten
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scanners</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y divide-border">
            {d.scanners.length === 0 && <li className="py-2 text-sm text-muted-foreground">Nog geen scanners.</li>}
            {d.scanners.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium">
                    {s.name} <span className="font-mono text-xs text-muted-foreground">{s.loginCode}</span>
                    {s.supervisor && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs">supervisor</span>}
                    {!s.active && <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-xs">uitgeschakeld</span>}
                    {s.locked && <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">geblokkeerd na foute PIN</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.entrance ? `Vaste ingang: ${s.entrance} · ` : ""}Laatst actief: {s.lastSeenAt ? formatDayTime(s.lastSeenAt) : "nooit"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { const r = await api<{ loginCode: string; pin: string }>(`/api/tickets/scanners/${s.id}/pin`, { body: {} }); setSecret({ name: s.name, ...r }); })}>
                    Nieuwe PIN
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { await api(`/api/tickets/scanners/${s.id}`, { method: "PUT", body: { name: s.name, supervisor: !s.supervisor, active: s.active, entranceId: s.entranceId } }); })}>
                    {s.supervisor ? "Geen supervisor meer" : "Maak supervisor"}
                  </Button>
                  <Button size="sm" variant={s.active ? "destructive" : "outline"} disabled={busy} onClick={() => run(async () => { await api(`/api/tickets/scanners/${s.id}`, { method: "PUT", body: { name: s.name, supervisor: s.supervisor, active: !s.active, entranceId: s.entranceId } }); })}>
                    {s.active ? "Uitschakelen" : "Inschakelen"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label htmlFor="sc-name">Nieuwe scanner</Label>
              <Input id="sc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bijv. Ingang Noord, vrijwilliger 1" />
            </div>
            <div>
              <Label htmlFor="sc-ent">Vaste ingang (optioneel)</Label>
              <select id="sc-ent" value={entranceId} onChange={(e) => setEntranceId(e.target.value)} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm">
                <option value="">Geen, kiest zelf</option>
                {d.entrances.filter((e) => e.active).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={supervisor} onChange={(e) => setSupervisor(e.target.checked)} /> Supervisor
              </label>
              <Button disabled={busy || name.trim().length < 2} onClick={() => run(async () => { const r = await api<{ loginCode: string; pin: string }>("/api/tickets/scanners", { body: { name, supervisor, active: true, entranceId: entranceId || null } }); setSecret({ name, loginCode: r.loginCode, pin: r.pin }); setName(""); setSupervisor(false); })}>
                Aanmaken
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Een supervisor mag een geweigerde of dubbele scan met reden toch toelaten; dat komt in het auditlog. Na vijf foute PIN-pogingen is een scanner 15 minuten geblokkeerd.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ingangen</CardTitle>
          <CardDescription>Optioneel gekoppeld aan een vak: tickets voor een ander vak worden bij die ingang geweigerd.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y divide-border">
            {d.entrances.length === 0 && <li className="py-2 text-sm text-muted-foreground">Nog geen ingangen.</li>}
            {d.entrances.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {e.name}
                  {e.zoneId && <span className="text-muted-foreground"> · vak {d.zones.find((z) => z.id === e.zoneId)?.name ?? "?"}</span>}
                  {!e.active && <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-xs">uitgeschakeld</span>}
                </span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { await api(`/api/tickets/entrances/${e.id}`, { method: "PUT", body: { name: e.name, zoneId: e.zoneId, active: !e.active } }); })}>
                  {e.active ? "Uitschakelen" : "Inschakelen"}
                </Button>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="en-name">Nieuwe ingang</Label>
              <Input id="en-name" value={eName} onChange={(e) => setEName(e.target.value)} placeholder="Bijv. Hoofdingang" />
            </div>
            <div>
              <Label htmlFor="en-zone">Vak (optioneel)</Label>
              <select id="en-zone" value={eZone} onChange={(e) => setEZone(e.target.value)} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm">
                <option value="">Alle vakken</option>
                {d.zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button disabled={busy || eName.trim().length < 2} onClick={() => run(async () => { await api("/api/tickets/entrances", { body: { name: eName, zoneId: eZone || null, active: true } }); setEName(""); setEZone(""); })}>
                Toevoegen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
