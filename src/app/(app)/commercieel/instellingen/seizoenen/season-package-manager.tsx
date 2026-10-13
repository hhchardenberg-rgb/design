"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate, formatEuro, parseEuro } from "@/lib/commercial/client";

interface Season { id: string; name: string; startsOn: string; endsOn: string; status: string }
interface Pkg { id: string; name: string; description: string | null; defaultAmountCents: number | null; items: { title: string; description: string | null; quantity: number }[] }
const STATUS: Record<string, string> = { DRAFT: "Concept", ACTIVE: "Actief", CLOSED: "Afgesloten" };

export function SeasonPackageManager({ canManage, canAmounts }: { canManage: boolean; canAmounts: boolean }) {
  const toast = useStableToast();
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [packages, setPackages] = useState<Pkg[] | null>(null);
  const [edit, setEdit] = useState<{ id: string | null; name: string; description: string; amount: string; items: string } | null>(null);
  const [season, setSeason] = useState({ name: "", startsOn: "", endsOn: "" });

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([api<{ seasons: Season[] }>("/api/commercial/seasons"), api<{ packages: Pkg[] }>("/api/commercial/packages")]);
    if (s.ok) setSeasons(s.data.seasons); else toast.error(s.error);
    if (p.ok) setPackages(p.data.packages); else toast.error(p.error);
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function addSeason(e: React.FormEvent) {
    e.preventDefault();
    const r = await api("/api/commercial/seasons", "POST", season);
    if (r.ok) { setSeason({ name: "", startsOn: "", endsOn: "" }); await load(); } else toast.error(r.error);
  }
  async function setStatus(s: Season, status: string) {
    const r = await api(`/api/commercial/seasons/${s.id}`, "PUT", { name: s.name, startsOn: s.startsOn, endsOn: s.endsOn, status });
    if (r.ok) await load(); else toast.error(r.error);
  }
  async function savePackage(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const amount = parseEuro(edit.amount);
    if (amount === null) { toast.error("Vul een geldig bedrag in, bijvoorbeeld 2500,00."); return; }
    const items = edit.items.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^(\d+)\s*[x×]\s*(.+)$/i); // "2x Reclamebord"
      return m ? { quantity: Number(m[1]), title: m[2] } : { title: l };
    });
    const body: Record<string, unknown> = { name: edit.name, description: edit.description || null, items };
    if (canAmounts && amount !== undefined) body.defaultAmountCents = amount;
    const r = await api(edit.id ? `/api/commercial/packages/${edit.id}` : "/api/commercial/packages", edit.id ? "PUT" : "POST", body);
    if (r.ok) { setEdit(null); toast.success("Pakket opgeslagen."); await load(); } else toast.error(r.error);
  }
  async function archive(p: Pkg) {
    if (!window.confirm(`Pakket “${p.name}” archiveren? Bestaande contracten behouden hun afspraken.`)) return;
    const r = await api(`/api/commercial/packages/${p.id}`, "DELETE");
    if (r.ok) await load(); else toast.error(r.error);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Seizoenen en pakketten</h1>
        <p className="text-sm text-muted-foreground">Een pakket is een sjabloon. Bij het afsluiten van een contract wordt vastgelegd wat het pakket toen bevatte; latere wijzigingen werken niet door in bestaande contracten.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Seizoenen</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y divide-border text-sm">
            {seasons?.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground">{formatDate(s.startsOn)} t/m {formatDate(s.endsOn)}</span>
                <Badge variant={s.status === "ACTIVE" ? "success" : "outline"}>{STATUS[s.status]}</Badge>
                {canManage && (
                  <select aria-label={`Status van ${s.name}`} className="ml-auto h-9 rounded-md border border-border bg-surface px-2" value={s.status} onChange={(e) => setStatus(s, e.target.value)}>
                    {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )}
              </li>
            ))}
            {seasons?.length === 0 && <li className="py-2 text-muted-foreground">Nog geen seizoenen.</li>}
          </ul>
          {canManage && (
            <form onSubmit={addSeason} className="flex flex-wrap items-end gap-3">
              <div><Label htmlFor="s-name">Naam</Label><Input id="s-name" required placeholder="2027/2028" value={season.name} onChange={(e) => setSeason({ ...season, name: e.target.value })} /></div>
              <div><Label htmlFor="s-start">Start</Label><Input id="s-start" type="date" required value={season.startsOn} onChange={(e) => setSeason({ ...season, startsOn: e.target.value })} /></div>
              <div><Label htmlFor="s-end">Einde</Label><Input id="s-end" type="date" required value={season.endsOn} onChange={(e) => setSeason({ ...season, endsOn: e.target.value })} /></div>
              <Button type="submit">Seizoen toevoegen</Button>
            </form>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Pakketten</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {packages?.map((p) => (
            <div key={p.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{p.name}</span>
                {p.defaultAmountCents != null && <span className="text-muted-foreground">standaard {formatEuro(p.defaultAmountCents)}</span>}
                {canManage && (
                  <span className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEdit({ id: p.id, name: p.name, description: p.description ?? "", amount: p.defaultAmountCents != null ? String(p.defaultAmountCents / 100).replace(".", ",") : "", items: p.items.map((i) => (i.quantity > 1 ? `${i.quantity}x ${i.title}` : i.title)).join("\n") })}>Bewerken</Button>
                    <Button size="sm" variant="outline" onClick={() => archive(p)}>Archiveren</Button>
                  </span>
                )}
              </div>
              {p.description && <p className="text-muted-foreground">{p.description}</p>}
              <ul className="mt-1 list-disc pl-5">{p.items.map((i, n) => <li key={n}>{i.quantity > 1 ? `${i.quantity}× ` : ""}{i.title}</li>)}</ul>
            </div>
          ))}
          {packages?.length === 0 && <p className="text-sm text-muted-foreground">Nog geen pakketten.</p>}
          {canManage && !edit && <Button variant="outline" onClick={() => setEdit({ id: null, name: "", description: "", amount: "", items: "" })}>Nieuw pakket</Button>}
          {edit && (
            <form onSubmit={savePackage} className="space-y-3 rounded-md border border-primary/40 p-3">
              <div><Label htmlFor="p-name">Naam</Label><Input id="p-name" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div><Label htmlFor="p-desc">Omschrijving</Label><Input id="p-desc" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
              {canAmounts && <div><Label htmlFor="p-amount">Standaardbedrag (excl. btw)</Label><Input id="p-amount" inputMode="decimal" placeholder="2500,00" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></div>}
              <div><Label htmlFor="p-items">Tegenprestaties (één per regel, bijvoorbeeld “2x Reclamebord”)</Label><Textarea id="p-items" rows={5} value={edit.items} onChange={(e) => setEdit({ ...edit, items: e.target.value })} /></div>
              <div className="flex gap-2"><Button type="submit">Opslaan</Button><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Annuleren</Button></div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
