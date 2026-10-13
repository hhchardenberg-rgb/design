"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate, formatEuro, parseEuro } from "@/lib/commercial/client";

interface Opp {
  id: string; companyId: string; companyName: string; title: string; stage: string; expectedCloseOn: string | null; ownerName: string | null;
  lostReason: string | null; wonContractId: string | null; version: number; amountVisible: boolean; expectedAmountCents: number | null;
}
interface Season { id: string; name: string; startsOn: string; endsOn: string; status: string }

const OPEN = ["LEAD", "CONTACTED", "PROPOSAL", "NEGOTIATION"] as const;
const LABEL: Record<string, string> = { LEAD: "Nieuwe kans", CONTACTED: "In gesprek", PROPOSAL: "Voorstel gedaan", NEGOTIATION: "Onderhandeling", WON: "Gewonnen", LOST: "Verloren" };

export function PipelineBoard({ canCreate, canUpdate, canArchive, canContract, canAmount, canCreateCompany }: { canCreate: boolean; canUpdate: boolean; canArchive: boolean; canContract: boolean; canAmount: boolean; canCreateCompany: boolean }) {
  const toast = useStableToast();
  const [data, setData] = useState<{ items: Opp[]; totalExpectedCents: number | null } | null>(null);
  const [mine, setMine] = useState(false);
  const [closed, setClosed] = useState(false);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (mine) q.set("mine", "1");
    if (closed) q.set("closed", "1");
    const r = await api<{ items: Opp[]; totalExpectedCents: number | null }>(`/api/commercial/opportunities?${q}`);
    if (r.ok) { setData(r.data); setError(null); } else setError(r.error);
  }, [mine, closed]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void api<{ seasons: Season[] }>("/api/commercial/seasons").then((r) => r.ok && setSeasons(r.data.seasons));
  }, []);

  async function move(o: Opp, stage: string) {
    let lostReason: string | undefined;
    if (stage === "LOST") {
      const v = window.prompt("Waarom is deze kans verloren?");
      if (!v?.trim()) return;
      lostReason = v;
    }
    const r = await api(`/api/commercial/opportunities/${o.id}/stage`, "POST", { stage, lostReason });
    if (r.ok) await load(); else toast.error(r.error);
  }
  async function win(o: Opp, seasonId: string) {
    const s = seasons.find((x) => x.id === seasonId);
    if (!s) return;
    const r = await api<{ contractId: string }>(`/api/commercial/opportunities/${o.id}/convert`, "POST", { seasonId, startsOn: s.startsOn, endsOn: s.endsOn });
    if (r.ok) { toast.success("Gewonnen: er staat een concept-contract klaar in het dossier."); await load(); } else toast.error(r.error);
  }
  async function archive(o: Opp) {
    if (!window.confirm(`Kans “${o.title}” archiveren?`)) return;
    const r = await api(`/api/commercial/opportunities/${o.id}`, "DELETE");
    if (r.ok) await load(); else toast.error(r.error);
  }

  const columns = closed ? [...OPEN, "WON", "LOST"] : [...OPEN];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pijplijn</h1>
          <p className="text-sm text-muted-foreground">Acquisitiekansen per fase. Een gewonnen kans wordt een concept-contract.</p>
        </div>
        {canCreate && <Button onClick={() => setCreating((v) => !v)}>Nieuwe kans</Button>}
      </div>
      {creating && <NewOpportunity canAmount={canAmount} canCreateCompany={canCreateCompany} onDone={async () => { setCreating(false); await load(); }} onCancel={() => setCreating(false)} />}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-hhc-orange" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Alleen mijn kansen</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-hhc-orange" checked={closed} onChange={(e) => setClosed(e.target.checked)} /> Ook gewonnen en verloren</label>
        {data?.totalExpectedCents != null && <span className="ml-auto text-muted-foreground">Verwachte waarde open kansen: <strong>{formatEuro(data.totalExpectedCents)}</strong></span>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!data ? <p className="text-sm text-muted-foreground">Laden…</p> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {columns.map((stage) => {
            const items = data.items.filter((i) => i.stage === stage);
            return (
              <section key={stage} aria-label={LABEL[stage]} className="space-y-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold">{LABEL[stage]} <Badge variant="outline">{items.length}</Badge></h2>
                {items.length === 0 && <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">Geen kansen</p>}
                {items.map((o) => (
                  <Card key={o.id}>
                    <CardContent className="space-y-2 p-3 text-sm">
                      <div className="font-medium">{o.title}</div>
                      <Link className="text-xs underline" href={`/commercieel/sponsoren/${o.companyId}`}>{o.companyName}</Link>
                      <div className="text-xs text-muted-foreground">{[o.ownerName, o.expectedCloseOn && `afsluiten ${formatDate(o.expectedCloseOn)}`, o.amountVisible && o.expectedAmountCents != null ? formatEuro(o.expectedAmountCents) : null].filter(Boolean).join(" · ")}</div>
                      {o.lostReason && <div className="text-xs">Reden: {o.lostReason}</div>}
                      {o.wonContractId && <Link className="text-xs underline" href={`/commercieel/sponsoren/${o.companyId}`}>Naar het contract</Link>}
                      {(OPEN as readonly string[]).includes(o.stage) && canUpdate && (
                        <div className="flex flex-wrap gap-2">
                          <select aria-label={`Fase van ${o.title}`} className="h-8 rounded-md border border-border bg-surface px-2 text-xs" value={o.stage} onChange={(e) => move(o, e.target.value)}>
                            {OPEN.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                            <option value="LOST">Verloren…</option>
                          </select>
                          {canContract && (
                            <select aria-label={`Winnen: kies seizoen voor ${o.title}`} className="h-8 rounded-md border border-border bg-surface px-2 text-xs" value="" onChange={(e) => e.target.value && win(o, e.target.value)}>
                              <option value="">Winnen voor…</option>
                              {seasons.filter((s) => s.status !== "CLOSED").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          )}
                          {canArchive && <Button size="sm" variant="ghost" onClick={() => archive(o)}>Archiveren</Button>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewOpportunity({ canAmount, canCreateCompany, onDone, onCancel }: { canAmount: boolean; canCreateCompany: boolean; onDone: () => Promise<void>; onCancel: () => void }) {
  const toast = useStableToast();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; city: string | null }[] | null>(null);
  const [company, setCompany] = useState<{ id: string; name: string } | null>(null);
  const [f, setF] = useState({ title: "", amount: "", close: "" });
  const [busy, setBusy] = useState(false);

  // Zoekt terwijl je typt; een lege lijst wordt ook als zodanig getoond.
  useEffect(() => {
    if (q.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void api<{ rows: { id: string; name: string; city: string | null }[] }>(`/api/commercial/companies?q=${encodeURIComponent(q.trim())}&pageSize=8`).then((r) => {
        if (cancelled) return;
        if (r.ok) setHits(r.data.rows); else toast.error(r.error);
      });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, toast]);

  async function createCompany() {
    setBusy(true);
    const r = await api<{ id: string }>("/api/commercial/companies", "POST", { name: q.trim() });
    setBusy(false);
    if (r.ok) { setCompany({ id: r.data.id, name: q.trim() }); toast.success("Dossier aangemaakt. Vul de rest later aan bij Sponsoren."); } else toast.error(r.error);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    const amount = parseEuro(f.amount);
    if (amount === null) { toast.error("Vul een geldig bedrag in, bijvoorbeeld 2500,00."); return; }
    const body: Record<string, unknown> = { title: f.title, expectedCloseOn: f.close || null };
    if (canAmount && amount !== undefined) body.expectedAmountCents = amount;
    setBusy(true);
    const r = await api(`/api/commercial/companies/${company.id}/opportunities`, "POST", body);
    setBusy(false);
    if (r.ok) { toast.success("Kans toegevoegd."); await onDone(); } else toast.error(r.error);
  }
  const searching = q.trim().length >= 2;
  const shown = searching ? hits : null;
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        {!company ? (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1"><Label htmlFor="o-q">Voor welk bedrijf is de kans?</Label><Input id="o-q" autoFocus placeholder="Typ de naam van het bedrijf" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <Button type="button" variant="ghost" onClick={onCancel}>Annuleren</Button>
            </div>
            {shown && (
              <ul className="divide-y divide-border text-sm">
                {shown.map((h) => <li key={h.id} className="flex items-center justify-between py-2"><span>{h.name}{h.city ? ` · ${h.city}` : ""}</span><Button size="sm" onClick={() => setCompany({ id: h.id, name: h.name })}>Kies</Button></li>)}
              </ul>
            )}
            {shown && shown.length === 0 && <p className="text-sm text-muted-foreground">Geen dossier gevonden met deze naam.</p>}
            {searching && canCreateCompany && (
              <Button type="button" variant="outline" disabled={busy} onClick={createCompany}>Nieuw dossier “{q.trim()}” aanmaken</Button>
            )}
            {searching && !canCreateCompany && shown && shown.length === 0 && <p className="text-xs text-muted-foreground">Je mag zelf geen dossiers aanmaken. Vraag een collega, of kies een bestaand dossier.</p>}
          </>
        ) : (
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
            <p className="text-sm sm:col-span-3">Bedrijf: <strong>{company.name}</strong> <button type="button" className="underline" onClick={() => setCompany(null)}>wijzigen</button></p>
            <div><Label htmlFor="o-title">Titel</Label><Input id="o-title" required autoFocus placeholder="Bijvoorbeeld: Bordsponsor 2026/2027" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            {canAmount && <div><Label htmlFor="o-amount">Verwachte waarde (excl. btw)</Label><Input id="o-amount" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>}
            <div><Label htmlFor="o-close">Verwacht afsluiten</Label><Input id="o-close" type="date" value={f.close} onChange={(e) => setF({ ...f, close: e.target.value })} /></div>
            <div className="flex gap-2 sm:col-span-3"><Button type="submit" disabled={busy}>Toevoegen</Button><Button type="button" variant="ghost" onClick={onCancel}>Annuleren</Button></div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
