"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate, formatEuro, parseEuro } from "@/lib/commercial/client";
import type { Permission } from "@/lib/commercial/permissions";

interface Contract {
  id: string; seasonId: string; seasonName: string; packageId: string | null; packageName: string | null; status: string;
  startsOn: string; endsOn: string; renewalOn: string | null; noticeUntil: string | null; autoRenew: boolean; notes: string | null;
  amountCents: number | null; amountVisible: boolean; version: number; renewedFromId: string | null;
  packageSnapshot: { items?: { title: string; quantity: number }[] } | null;
}
interface Season { id: string; name: string; startsOn: string; endsOn: string; status: string }
interface Pkg { id: string; name: string; defaultAmountCents: number | null }
interface Counterpart { id: string; title: string; quantity: number; status: string; dueOn: string | null }

const STATUS: Record<string, string> = { DRAFT: "Concept", ACTIVE: "Lopend", ENDED: "Beëindigd", CANCELLED: "Geannuleerd" };
const CP_STATUS: Record<string, string> = { PLANNED: "Gepland", IN_PROGRESS: "Bezig", DELIVERED: "Geleverd", CANCELLED: "Vervallen" };

export function ContractsTab({ companyId, can }: { companyId: string; can: (p: Permission) => boolean }) {
  const toast = useStableToast();
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const [c, s, p] = await Promise.all([
      api<{ rows: Contract[] }>(`/api/commercial/contracts?companyId=${companyId}&pageSize=100`),
      api<{ seasons: Season[] }>("/api/commercial/seasons"),
      api<{ packages: Pkg[] }>("/api/commercial/packages"),
    ]);
    if (c.ok) setContracts(c.data.rows); else toast.error(c.error);
    if (s.ok) setSeasons(s.data.seasons);
    if (p.ok) setPackages(p.data.packages);
  }, [companyId, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      {can("contracts:create") && !creating && <Button onClick={() => setCreating(true)}>Nieuw contract</Button>}
      {creating && <NewContract companyId={companyId} seasons={seasons} packages={packages} canAmount={can("amounts:update")} onClose={() => setCreating(false)} onDone={async () => { setCreating(false); await load(); }} />}
      {!contracts ? <p className="text-sm text-muted-foreground">Laden…</p> : contracts.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen contracten bij dit dossier.</p> : (
        contracts.map((c) => <ContractCard key={c.id} c={c} seasons={seasons} can={can} onChanged={load} />)
      )}
      <p className="text-xs text-muted-foreground">Overzicht van alle contracten: <Link className="underline" href="/commercieel/contracten">Contracten</Link></p>
    </div>
  );
}

function NewContract({ companyId, seasons, packages, canAmount, onClose, onDone }: { companyId: string; seasons: Season[]; packages: Pkg[]; canAmount: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useStableToast();
  const [f, setF] = useState({ seasonId: "", packageId: "", startsOn: "", endsOn: "", amount: "", noticeUntil: "", renewalOn: "", notes: "" });
  const pick = (seasonId: string) => {
    const s = seasons.find((x) => x.id === seasonId);
    setF((v) => ({ ...v, seasonId, startsOn: s?.startsOn ?? v.startsOn, endsOn: s?.endsOn ?? v.endsOn }));
  };
  const pickPackage = (packageId: string) => {
    const p = packages.find((x) => x.id === packageId);
    setF((v) => ({ ...v, packageId, amount: canAmount && p?.defaultAmountCents != null && !v.amount ? String(p.defaultAmountCents / 100).replace(".", ",") : v.amount }));
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseEuro(f.amount);
    if (amount === null) { toast.error("Vul een geldig bedrag in, bijvoorbeeld 2500,00."); return; }
    const body: Record<string, unknown> = { seasonId: f.seasonId, packageId: f.packageId || null, startsOn: f.startsOn, endsOn: f.endsOn, noticeUntil: f.noticeUntil || null, renewalOn: f.renewalOn || null, notes: f.notes || null };
    if (canAmount && amount !== undefined) body.amountCents = amount;
    const r = await api(`/api/commercial/companies/${companyId}/contracts`, "POST", body);
    if (r.ok) { toast.success("Concept-contract aangemaakt."); await onDone(); } else toast.error(r.error);
  }
  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="c-season">Seizoen</Label>
            <select id="c-season" required className="h-10 w-full rounded-md border border-border bg-surface px-2 text-sm" value={f.seasonId} onChange={(e) => pick(e.target.value)}>
              <option value="">Kies…</option>{seasons.filter((s) => s.status !== "CLOSED").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div><Label htmlFor="c-pkg">Pakket</Label>
            <select id="c-pkg" className="h-10 w-full rounded-md border border-border bg-surface px-2 text-sm" value={f.packageId} onChange={(e) => pickPackage(e.target.value)}>
              <option value="">Nog geen pakket</option>{packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          <div><Label htmlFor="c-start">Start</Label><Input id="c-start" type="date" required value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} /></div>
          <div><Label htmlFor="c-end">Einde</Label><Input id="c-end" type="date" required value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} /></div>
          {canAmount && <div><Label htmlFor="c-amount">Bedrag (excl. btw)</Label><Input id="c-amount" inputMode="decimal" placeholder="2500,00" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>}
          <div><Label htmlFor="c-notice">Uiterste opzegdatum</Label><Input id="c-notice" type="date" value={f.noticeUntil} onChange={(e) => setF({ ...f, noticeUntil: e.target.value })} /></div>
          <div><Label htmlFor="c-renew">Verlengingsgesprek rond</Label><Input id="c-renew" type="date" value={f.renewalOn} onChange={(e) => setF({ ...f, renewalOn: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label htmlFor="c-notes">Notitie</Label><Textarea id="c-notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          <div className="flex gap-2 sm:col-span-2"><Button type="submit">Concept aanmaken</Button><Button type="button" variant="ghost" onClick={onClose}>Annuleren</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

function ContractCard({ c, seasons, can, onChanged }: { c: Contract; seasons: Season[]; can: (p: Permission) => boolean; onChanged: () => Promise<void> }) {
  const toast = useStableToast();
  const [cps, setCps] = useState<Counterpart[] | null>(null);
  const [title, setTitle] = useState("");
  const [renew, setRenew] = useState<{ seasonId: string; startsOn: string; endsOn: string } | null>(null);

  const loadCps = useCallback(async () => {
    if (!can("counterparts:read")) return;
    const r = await api<{ counterparts: Counterpart[] }>(`/api/commercial/contracts/${c.id}/counterparts`);
    if (r.ok) setCps(r.data.counterparts);
  }, [c.id, can]);
  useEffect(() => {
    void loadCps();
  }, [loadCps, c.version]);

  async function status(to: string, label: string) {
    if (!window.confirm(`Contract ${label}?`)) return;
    const r = await api(`/api/commercial/contracts/${c.id}/status`, "POST", { status: to });
    if (r.ok) await onChanged(); else toast.error(r.error);
  }
  async function setCp(id: string, st: string) {
    const r = await api(`/api/commercial/counterparts/${id}`, "PUT", { status: st });
    if (r.ok) await loadCps(); else toast.error(r.error);
  }
  async function addCp(e: React.FormEvent) {
    e.preventDefault();
    const r = await api(`/api/commercial/contracts/${c.id}/counterparts`, "POST", { title });
    if (r.ok) { setTitle(""); await loadCps(); } else toast.error(r.error);
  }
  async function doRenew(e: React.FormEvent) {
    e.preventDefault();
    const r = await api(`/api/commercial/contracts/${c.id}/renew`, "POST", renew);
    if (r.ok) { toast.success("Concept-verlenging aangemaakt."); setRenew(null); await onChanged(); } else toast.error(r.error);
  }
  const open = c.status === "DRAFT" || c.status === "ACTIVE";

  return (
    <Card>
      <CardContent className="space-y-3 pt-5 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-base font-semibold">{c.seasonName}</span>
          <Badge variant={c.status === "ACTIVE" ? "success" : "outline"}>{STATUS[c.status]}</Badge>
          <span className="text-muted-foreground">{c.packageName ?? "Geen pakket"} · {formatDate(c.startsOn)} t/m {formatDate(c.endsOn)}</span>
          {c.amountVisible && <span className="ml-auto font-medium">{formatEuro(c.amountCents)}</span>}
        </div>
        {(c.noticeUntil || c.renewalOn) && <p className="text-muted-foreground">{c.noticeUntil && <>Opzeggen uiterlijk {formatDate(c.noticeUntil)}. </>}{c.renewalOn && <>Verlengingsgesprek rond {formatDate(c.renewalOn)}.</>}</p>}
        {c.notes && <p>{c.notes}</p>}
        <div className="flex flex-wrap gap-2">
          {c.status === "DRAFT" && can("contracts:approve") && <Button size="sm" onClick={() => status("ACTIVE", "activeren")}>Activeren</Button>}
          {c.status === "ACTIVE" && can("contracts:update") && <Button size="sm" variant="outline" onClick={() => status("ENDED", "beëindigen")}>Beëindigen</Button>}
          {open && can("contracts:update") && <Button size="sm" variant="outline" onClick={() => status("CANCELLED", "annuleren")}>Annuleren</Button>}
          {(c.status === "ACTIVE" || c.status === "ENDED") && can("contracts:create") && !renew && <Button size="sm" variant="outline" onClick={() => setRenew({ seasonId: "", startsOn: "", endsOn: "" })}>Verlengen</Button>}
        </div>
        {renew && (
          <form onSubmit={doRenew} className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
            <div><Label htmlFor={`rs-${c.id}`}>Nieuw seizoen</Label>
              <select id={`rs-${c.id}`} required className="h-10 rounded-md border border-border bg-surface px-2" value={renew.seasonId}
                onChange={(e) => { const s = seasons.find((x) => x.id === e.target.value); setRenew({ seasonId: e.target.value, startsOn: s?.startsOn ?? "", endsOn: s?.endsOn ?? "" }); }}>
                <option value="">Kies…</option>{seasons.filter((s) => s.id !== c.seasonId && s.status !== "CLOSED").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <Button type="submit" size="sm">Concept-verlenging maken</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRenew(null)}>Annuleren</Button>
          </form>
        )}
        {can("counterparts:read") && (
          <div>
            <h4 className="mb-1 font-medium">Tegenprestaties</h4>
            <ul className="divide-y divide-border">
              {cps?.map((cp) => (
                <li key={cp.id} className="flex flex-wrap items-center gap-3 py-1.5">
                  <span>{cp.quantity > 1 ? `${cp.quantity}× ` : ""}{cp.title}{cp.dueOn ? ` (voor ${formatDate(cp.dueOn)})` : ""}</span>
                  <select aria-label={`Status van ${cp.title}`} disabled={!can("counterparts:update")} className="ml-auto h-8 rounded-md border border-border bg-surface px-2" value={cp.status} onChange={(e) => setCp(cp.id, e.target.value)}>
                    {Object.entries(CP_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </li>
              ))}
              {cps?.length === 0 && <li className="py-1.5 text-muted-foreground">Geen tegenprestaties.</li>}
            </ul>
            {can("counterparts:create") && c.status !== "CANCELLED" && (
              <form onSubmit={addCp} className="mt-2 flex gap-2"><Input aria-label="Nieuwe tegenprestatie" placeholder="Extra tegenprestatie toevoegen" value={title} onChange={(e) => setTitle(e.target.value)} required /><Button type="submit" size="sm" variant="outline">Toevoegen</Button></form>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
