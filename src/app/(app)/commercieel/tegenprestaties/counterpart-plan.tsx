"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate } from "@/lib/commercial/client";

interface Row {
  id: string;
  title: string;
  quantity: number;
  status: "PLANNED" | "IN_PROGRESS" | "DELIVERED" | "CANCELLED";
  dueOn: string | null;
  overdue: boolean;
  companyId: string;
  companyName: string;
  seasonName: string;
}
interface Season { id: string; name: string; status: string }

const STATUS_LABEL = { PLANNED: "Gepland", IN_PROGRESS: "Bezig", DELIVERED: "Geleverd", CANCELLED: "Vervallen" } as const;
const VIEWS = [
  { key: "OPEN", label: "Te leveren" },
  { key: "overdue", label: "Te laat" },
  { key: "DELIVERED", label: "Geleverd" },
  { key: "ALL", label: "Alles" },
] as const;

export function CounterpartPlan({ canUpdate }: { canUpdate: boolean }) {
  const toast = useStableToast();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<string>("");
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("OPEN");
  const [data, setData] = useState<{ counts: Record<string, number>; rows: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<{ seasons: Season[] }>("/api/commercial/seasons");
      if (r.ok) {
        setSeasons(r.data.seasons);
        setSeasonId((cur) => cur || r.data.seasons.find((s) => s.status === "ACTIVE")?.id || "");
      }
    })();
  }, []);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (seasonId) q.set("seasonId", seasonId);
    if (view === "overdue") q.set("overdue", "1");
    else q.set("status", view);
    const r = await api<{ counts: Record<string, number>; rows: Row[] }>(`/api/commercial/counterparts?${q}`);
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else setError(r.error);
  }, [seasonId, view]);
  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(row: Row, status: string) {
    const r = await api(`/api/commercial/counterparts/${row.id}`, "PUT", { status });
    if (r.ok) await load();
    else toast.error(r.error);
  }

  const c = data?.counts;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Tegenprestaties</h1>
        <p className="text-sm text-muted-foreground">Wat HHC aan sponsoren heeft toegezegd en nog moet leveren. Vink af wat geleverd is.</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="cp-season">Seizoen</Label>
          <select id="cp-season" value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className="h-10 rounded-md border border-border bg-surface px-3 text-sm">
            <option value="">Alle seizoenen</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {c && (
          <p className="pb-2 text-sm text-muted-foreground">
            {c.PLANNED + c.IN_PROGRESS} te leveren · {c.DELIVERED} geleverd
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)} className={`rounded-full border px-3 py-1 text-sm ${view === v.key ? "border-primary bg-primary/10 text-hhc-orange-dark" : "border-border hover:bg-surface-muted"}`}>
            {v.label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Card>
        <CardContent className="p-0">
          {!data ? <p className="p-5 text-sm text-muted-foreground">Laden…</p> : data.rows.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Niets in deze weergave.</p> : (
            <ul className="divide-y divide-border">
              {data.rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <input type="checkbox" aria-label={`${r.title} als geleverd markeren`} className="h-4 w-4 accent-hhc-orange" checked={r.status === "DELIVERED"} disabled={!canUpdate || r.status === "CANCELLED"} onChange={() => setStatus(r, r.status === "DELIVERED" ? "PLANNED" : "DELIVERED")} />
                  <div className="min-w-0">
                    <div className={r.status === "DELIVERED" ? "text-muted-foreground line-through" : "font-medium"}>{r.quantity > 1 ? `${r.quantity}× ` : ""}{r.title}</div>
                    <div className="text-xs text-muted-foreground"><Link className="underline" href={`/commercieel/sponsoren/${r.companyId}`}>{r.companyName}</Link> · {r.seasonName}</div>
                  </div>
                  <div className="ml-auto flex items-center gap-2 text-muted-foreground">
                    {r.overdue && <Badge variant="primary">Te laat</Badge>}
                    {canUpdate && r.status !== "DELIVERED" && r.status !== "CANCELLED" ? (
                      <select aria-label={`Status van ${r.title}`} value={r.status} onChange={(e) => setStatus(r, e.target.value)} className="h-8 rounded-md border border-border bg-surface px-2 text-xs">
                        <option value="PLANNED">Gepland</option>
                        <option value="IN_PROGRESS">Bezig</option>
                        <option value="CANCELLED">Vervallen</option>
                      </select>
                    ) : <span>{STATUS_LABEL[r.status]}</span>}
                    <span>{r.dueOn ? formatDate(r.dueOn) : "geen datum"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
