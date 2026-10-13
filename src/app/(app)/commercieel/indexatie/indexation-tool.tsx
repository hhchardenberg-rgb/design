"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate, formatEuro } from "@/lib/commercial/client";

interface Season { id: string; name: string; status: string }
interface Item { contractId: string; companyId: string; companyName: string; previousCents: number | null; currentCents: number | null; newCents: number | null }
interface Run { id: string; seasonName: string; basisPoints: number; contracts: number; appliedAt: string; appliedBy: string | null }

export function IndexationTool({ canApply }: { canApply: boolean }) {
  const toast = useStableToast();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [percent, setPercent] = useState("3");
  const [rounding, setRounding] = useState(100);
  const [preview, setPreview] = useState<{ items: Item[]; skippedWithoutBase: number } | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false);

  const loadRuns = useCallback(async () => {
    const r = await api<{ runs: Run[] }>("/api/commercial/indexation");
    if (r.ok) setRuns(r.data.runs);
  }, []);
  useEffect(() => {
    void api<{ seasons: Season[] }>("/api/commercial/seasons").then((r) => r.ok && setSeasons(r.data.seasons));
    void loadRuns();
  }, [loadRuns]);

  const basisPoints = Math.round(parseFloat(percent.replace(",", ".")) * 100);
  const valid = seasonId !== "" && Number.isFinite(basisPoints);

  async function run(apply: boolean) {
    if (!valid) return;
    if (apply && !window.confirm(`${percent}% indexatie toepassen op ${preview?.items.filter((i) => i.newCents != null).length ?? 0} concept-contract(en)? De bedragen worden overschreven en dit kun je niet automatisch terugdraaien.`)) return;
    setBusy(true);
    const r = await api<{ items?: Item[]; skippedWithoutBase?: number; applied?: { contracts: number } }>("/api/commercial/indexation", "POST", { seasonId, basisPoints, roundingCents: rounding, apply });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    if (apply) {
      toast.success(`Indexatie toegepast op ${r.data.applied?.contracts} contract(en).`);
      setPreview(null);
      await loadRuns();
    } else setPreview({ items: r.data.items ?? [], skippedWithoutBase: r.data.skippedWithoutBase ?? 0 });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Indexatie</h1>
        <p className="text-sm text-muted-foreground">Pas een percentage toe op de concept-verlengingen van een seizoen. De basis is het bedrag van het voorgaande contract; een verlenging wordt maar één keer geïndexeerd. Maak eerst de verlengingen aan in de dossiers (tab Contracten, Verlengen).</p>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <div><Label htmlFor="ix-season">Seizoen van de verlengingen</Label>
            <select id="ix-season" className="h-10 rounded-md border border-border bg-surface px-2 text-sm" value={seasonId} onChange={(e) => { setSeasonId(e.target.value); setPreview(null); }}>
              <option value="">Kies…</option>{seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div><Label htmlFor="ix-pct">Percentage</Label><Input id="ix-pct" inputMode="decimal" className="w-24" value={percent} onChange={(e) => { setPercent(e.target.value); setPreview(null); }} /></div>
          <div><Label htmlFor="ix-round">Afronden op</Label>
            <select id="ix-round" className="h-10 rounded-md border border-border bg-surface px-2 text-sm" value={rounding} onChange={(e) => { setRounding(Number(e.target.value)); setPreview(null); }}>
              <option value={1}>Eurocent</option><option value={100}>Hele euro&apos;s</option><option value={500}>5 euro</option><option value={1000}>10 euro</option>
            </select></div>
          <Button disabled={!valid || busy} onClick={() => run(false)}>Voorbeeld tonen</Button>
        </CardContent>
      </Card>
      {preview && (
        <Card>
          <CardHeader><CardTitle>Voorbeeld ({preview.items.length} contract{preview.items.length === 1 ? "" : "en"})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {preview.items.length === 0 ? <p className="text-sm text-muted-foreground">Geen concept-verlengingen om te indexeren in dit seizoen.</p> : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-1">Sponsor</th><th className="py-1 text-right">Vorig seizoen</th><th className="py-1 text-right">Nu</th><th className="py-1 text-right">Na indexatie</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {preview.items.map((i) => (
                    <tr key={i.contractId}><td className="py-1.5"><Link className="underline" href={`/commercieel/sponsoren/${i.companyId}`}>{i.companyName}</Link></td>
                      <td className="py-1.5 text-right">{formatEuro(i.previousCents)}</td><td className="py-1.5 text-right">{formatEuro(i.currentCents)}</td>
                      <td className="py-1.5 text-right font-medium">{i.newCents == null ? "geen basisbedrag" : formatEuro(i.newCents)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {preview.skippedWithoutBase > 0 && <p className="text-xs text-muted-foreground">{preview.skippedWithoutBase} verlenging(en) worden overgeslagen omdat het voorgaande contract geen bedrag heeft.</p>}
            {canApply ? <Button disabled={busy || preview.items.every((i) => i.newCents == null)} onClick={() => run(true)}>Indexatie toepassen</Button> : <p className="text-xs text-muted-foreground">Toepassen vereist de bevoegdheid om bedragen goed te keuren.</p>}
          </CardContent>
        </Card>
      )}
      {runs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Eerdere indexaties</CardTitle></CardHeader>
          <CardContent><ul className="divide-y divide-border text-sm">{runs.map((r) => <li key={r.id} className="py-1.5">{formatDate(r.appliedAt, true)} · {r.seasonName} · {(r.basisPoints / 100).toLocaleString("nl-NL")}% · {r.contracts} contract(en){r.appliedBy ? ` · ${r.appliedBy}` : ""}</li>)}</ul></CardContent>
        </Card>
      )}
    </div>
  );
}
