"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { api, formatDate } from "@/lib/commercial/client";
import { AUDIT_ACTION_LABELS } from "@/lib/commercial/audit-labels";

interface Row { id: string; at: string; actorId: string | null; actor: string | null; action: string; entity: string; entityId: string | null; targetName: string | null; before: unknown; after: unknown }
interface Person { id: string; name: string | null; email: string }

const GROUPS = [
  { value: "", label: "Alles" },
  { value: "member.", label: "Toegang en rechten" },
  { value: "membership.", label: "Toegang geven en intrekken" },
  { value: "role.", label: "Rollen" },
  { value: "company.", label: "Dossiers" },
  { value: "contract.", label: "Contracten" },
  { value: "invoice", label: "Facturen" },
  { value: "payment.", label: "Betalingen" },
  { value: "mailing.", label: "Mailings" },
  { value: "file.", label: "Bestanden" },
  { value: "export.", label: "Exports" },
];

export function AuditLog() {
  const [people, setPeople] = useState<Person[]>([]);
  const [actorId, setActorId] = useState("");
  const [prefix, setPrefix] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; pageSize: number; rows: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ people: Person[] }>("/api/commercial/oversight/people").then((r) => r.ok && setPeople(r.data.people));
  }, []);
  const load = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page) });
    if (actorId) q.set("actorId", actorId);
    if (prefix) q.set("actionPrefix", prefix);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const r = await api<{ total: number; pageSize: number; rows: Row[] }>(`/api/commercial/oversight/audit?${q}`);
    if (r.ok) { setData(r.data); setError(null); } else setError(r.error);
  }, [actorId, prefix, from, to, page]);
  useEffect(() => { void load(); }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const sel = "block h-10 rounded-md border border-border bg-surface px-2 text-sm";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Logboek</h1>
        <p className="text-sm text-muted-foreground">Wie heeft wat gedaan in Commerciële Zaken: wijzigingen, verzendingen, downloads en rechten. Bedragen worden bewust niet vastgelegd.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div><Label htmlFor="al-actor">Persoon</Label>
          <select id="al-actor" className={sel} value={actorId} onChange={(e) => { setActorId(e.target.value); setPage(1); }}>
            <option value="">Iedereen</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}
          </select></div>
        <div><Label htmlFor="al-type">Soort</Label>
          <select id="al-type" className={sel} value={prefix} onChange={(e) => { setPrefix(e.target.value); setPage(1); }}>
            {GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select></div>
        <div><Label htmlFor="al-from">Van</Label><Input id="al-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></div>
        <div><Label htmlFor="al-to">Tot en met</Label><Input id="al-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Card>
        <CardContent className="p-0">
          {!data ? <p className="p-5 text-sm text-muted-foreground">Laden…</p> : data.rows.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Niets gevonden.</p> : (
            <ul className="divide-y divide-border text-sm">
              {data.rows.map((r) => (
                <li key={r.id} className="p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{AUDIT_ACTION_LABELS[r.action] ?? r.action}{r.targetName ? ` – ${r.targetName}` : ""}</span>
                    <span className="text-muted-foreground">{r.actor ?? "onbekend"} · {formatDate(r.at, true)}</span>
                  </div>
                  {(r.before != null || r.after != null) && (
                    <details className="mt-1 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Details</summary>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-surface-muted p-2">{JSON.stringify({ voor: r.before ?? undefined, na: r.after ?? undefined }, null, 2)}</pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Vorige</Button>
          <span>Pagina {page} van {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Volgende</Button>
        </div>
      )}
    </div>
  );
}
