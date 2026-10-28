"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate } from "@/lib/commercial/client";

interface Task {
  id: string;
  title: string;
  status: "OPEN" | "DONE";
  priority: "LOW" | "NORMAL" | "HIGH";
  dueAt: string | null;
  assigneeName: string | null;
  companyId: string | null;
  companyName: string | null;
}

type View = "mine" | "all" | "overdue" | "done";
const VIEWS: { key: View; label: string; query: string }[] = [
  { key: "mine", label: "Mijn open taken", query: "mine=1&status=OPEN" },
  { key: "overdue", label: "Achterstallig", query: "overdue=1" },
  { key: "all", label: "Alle open taken", query: "status=OPEN" },
  { key: "done", label: "Afgerond", query: "status=DONE" },
];

export function TaskBoard({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const toast = useStableToast();
  const [view, setView] = useState<View>("mine");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; pageSize: number; rows: Task[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const load = useCallback(async () => {
    const q = VIEWS.find((v) => v.key === view)!.query;
    const r = await api<{ total: number; pageSize: number; rows: Task[] }>(`/api/commercial/tasks?${q}&page=${page}`);
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else setError(r.error);
  }, [view, page]);
  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(t: Task) {
    const r = await api(`/api/commercial/tasks/${t.id}/done`, "POST", { done: t.status === "OPEN" });
    if (r.ok) await load();
    else toast.error(r.error);
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const r = await api("/api/commercial/tasks", "POST", { title, dueAt: due ? new Date(due).toISOString() : null });
    if (r.ok) {
      setTitle("");
      setDue("");
      toast.success("Taak toegevoegd.");
      await load();
    } else toast.error(r.error);
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const overdue = (t: Task) => t.status === "OPEN" && t.dueAt && new Date(t.dueAt) < new Date();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Taken</h1>
        <p className="text-sm text-muted-foreground">Taken en afspraken binnen Commerciële Zaken. Je ziet de taken binnen jouw bereik.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => { setView(v.key); setPage(1); }} className={`rounded-full border px-3 py-1 text-sm ${view === v.key ? "border-primary bg-primary/10 text-hhc-orange-dark" : "border-border hover:bg-surface-muted"}`}>
            {v.label}
          </button>
        ))}
      </div>
      {canCreate && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1"><Label htmlFor="nt-title">Nieuwe taak (voor jezelf)</Label><Input id="nt-title" required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label htmlFor="nt-due">Deadline</Label><Input id="nt-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <Button type="submit">Toevoegen</Button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Card>
        <CardContent className="p-0">
          {!data ? <p className="p-5 text-sm text-muted-foreground">Laden…</p> : data.rows.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Geen taken in deze weergave.</p> : (
            <ul className="divide-y divide-border">
              {data.rows.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <input type="checkbox" aria-label={`Taak ${t.title} afronden`} className="h-4 w-4 accent-hhc-orange" checked={t.status === "DONE"} disabled={!canUpdate} onChange={() => toggle(t)} />
                  <div className="min-w-0">
                    <div className={t.status === "DONE" ? "text-muted-foreground line-through" : "font-medium"}>{t.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.companyId ? <Link className="underline" href={`/commercieel/sponsoren/${t.companyId}`}>{t.companyName}</Link> : t.companyName ? t.companyName : null}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2 text-muted-foreground">
                    {t.priority === "HIGH" && <Badge variant="primary">Hoog</Badge>}
                    {overdue(t) && <Badge variant="primary">Achterstallig</Badge>}
                    <span>{[t.assigneeName, t.dueAt && formatDate(t.dueAt, true)].filter(Boolean).join(" · ")}</span>
                  </div>
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
