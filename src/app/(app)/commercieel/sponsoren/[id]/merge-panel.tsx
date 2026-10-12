"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api } from "@/lib/commercial/client";

interface Hit { id: string; name: string; city: string | null }

/** Voegt een dubbel dossier samen in het huidige dossier. Het dubbele dossier blijft gearchiveerd bewaard. */
export function MergePanel({ companyId, companyName, onDone }: { companyId: string; companyName: string; onDone: () => Promise<void> }) {
  const toast = useStableToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const r = await api<{ rows: Hit[] }>(`/api/commercial/companies?q=${encodeURIComponent(q)}&pageSize=10`);
    if (r.ok) setHits(r.data.rows.filter((h) => h.id !== companyId));
    else toast.error(r.error);
  }
  async function merge(h: Hit) {
    if (!window.confirm(`“${h.name}” samenvoegen in “${companyName}”? Contactpersonen, historie, taken en bestanden verhuizen mee. Het dossier “${h.name}” wordt gearchiveerd. Dit kun je niet automatisch ongedaan maken.`)) return;
    setBusy(true);
    const r = await api<{ moved: Record<string, number> }>(`/api/commercial/companies/${companyId}/merge`, "POST", { sourceId: h.id });
    setBusy(false);
    if (r.ok) {
      const m = r.data.moved;
      toast.success(`Samengevoegd: ${m.contacts} contactpersonen, ${m.activities} contactmomenten, ${m.tasks} taken, ${m.files} bestanden.`);
      setOpen(false);
      setHits([]);
      await onDone();
      router.refresh();
    } else toast.error(r.error);
  }

  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}>Dubbel dossier samenvoegen…</Button>;
  return (
    <Card>
      <CardHeader><CardTitle>Dubbel dossier samenvoegen</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={search} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1"><Label htmlFor="merge-q">Zoek het dubbele dossier</Label><Input id="merge-q" required value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Button type="submit" variant="outline">Zoeken</Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
        </form>
        <ul className="divide-y divide-border text-sm">
          {hits.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 py-2">
              <span>{h.name}{h.city ? ` · ${h.city}` : ""}</span>
              <Button size="sm" disabled={busy} onClick={() => merge(h)}>Samenvoegen in dit dossier</Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
