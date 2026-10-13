"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate, formatEuro, parseEuro } from "@/lib/commercial/client";

interface Season { id: string; name: string; status: string }
interface Standing { missingCents: number; forecastCents: number; shortfallCents: number; progressPercent: number }
interface Row { key: string; name: string; contractCount: number; opportunityCount: number; targetCents: number | null; realisedCents: number | null; draftCents: number | null; pipelineWeightedCents: number | null; standing: Standing | null }
interface Data {
  season: { id: string; name: string; startsOn: string; endsOn: string };
  amountsVisible: boolean; pipelineVisible: boolean; partial: boolean;
  weights: { stage: string; percent: number }[];
  notes: { undatedOpportunities: number; opportunitiesWithoutAmount: number };
  rows: Row[];
}

const STAGE: Record<string, string> = { LEAD: "Lead", CONTACTED: "Gesproken", PROPOSAL: "Voorstel", NEGOTIATION: "Onderhandeling" };
const toInput = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));

export function Goals({ canEdit }: { canEdit: boolean }) {
  const toast = useStableToast();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    void api<{ seasons: Season[] }>("/api/commercial/seasons").then((r) => {
      if (!r.ok) return;
      setSeasons(r.data.seasons);
      const current = r.data.seasons.find((s) => s.status === "ACTIVE") ?? r.data.seasons[0];
      if (current) setSeasonId(current.id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!seasonId) return;
    const r = await api<Data>(`/api/commercial/goals?seasonId=${encodeURIComponent(seasonId)}`);
    if (r.ok) {
      setData(r.data);
      setDraft(Object.fromEntries(r.data.rows.map((x) => [x.key, toInput(x.targetCents)])));
    } else toast.error(r.error);
  }, [seasonId, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!data) return;
    const goals: { tier: string; targetCents: number | null }[] = [];
    for (const row of data.rows) {
      const v = parseEuro(draft[row.key] ?? "");
      if (v === null) return toast.error(`Controleer het bedrag bij ${row.name}.`);
      goals.push({ tier: row.key, targetCents: v ?? null });
    }
    const r = await api("/api/commercial/goals", "PUT", { seasonId, goals });
    if (r.ok) {
      toast.success("Doelen opgeslagen.");
      await load();
    } else toast.error(r.error);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Doelen en prognose</h1>
        <p className="text-sm text-muted-foreground">Het sponsordoel per seizoen, in totaal en per sponsorvorm: wat al loopt, wat er nog ontbreekt en wat de pijplijn naar verwachting nog oplevert. Bedragen zijn exclusief btw en alleen zichtbaar met bedragenrechten.</p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <label htmlFor="goal-season" className="text-sm font-medium">Seizoen</label>
          <select id="goal-season" className="block h-10 rounded-md border border-border bg-surface px-2 text-sm" value={seasonId} onChange={(e) => { setSeasonId(e.target.value); setData(null); }}>
            <option value="">Kies…</option>{seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </CardContent>
      </Card>

      {data && !data.amountsVisible && <Card><CardContent className="p-5 text-sm text-muted-foreground">Je hebt geen bedragenrechten, dus je ziet alleen aantallen. Vraag een beheerder om “Sponsorbedragen en inkomsten – Bekijken” als je de bedragen en doelen wilt zien.</CardContent></Card>}
      {data && data.partial && <Card><CardContent className="p-5 text-sm">Je ziet maar een deel van de dossiers (je bereik is beperkt). Het doel geldt voor de hele vereniging, daarom worden hier geen “nog nodig” en voortgang berekend.</CardContent></Card>}

      {data && (
        <Card>
          <CardHeader>
            <CardTitle>{data.season.name}</CardTitle>
            <CardDescription>Gerealiseerd = lopende contracten met een bedrag. Concepten tellen niet mee. De prognose telt daar de gewogen pijplijn bij op.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1">Sponsorvorm</th>
                    <th className="py-1 text-right">Doel</th>
                    <th className="py-1 text-right">Loopt</th>
                    {data.pipelineVisible && <th className="py-1 text-right">Pijplijn (gewogen)</th>}
                    <th className="py-1 text-right">Nog nodig</th>
                    {data.pipelineVisible && <th className="py-1 text-right">Tekort na prognose</th>}
                    <th className="py-1 text-right">Voortgang</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((r) => (
                    <tr key={r.key} className={r.key === "ALL" ? "font-semibold" : ""}>
                      <td className="py-1.5">{r.name}<span className="block text-xs font-normal text-muted-foreground">{r.contractCount} contract(en){data.pipelineVisible ? ` · ${r.opportunityCount} kans(en)` : ""}</span></td>
                      <td className="py-1.5 text-right">
                        {canEdit ? <Input aria-label={`Doel ${r.name}`} className="ml-auto w-32 text-right" inputMode="decimal" placeholder="geen doel" value={draft[r.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))} /> : formatEuro(r.targetCents)}
                      </td>
                      <td className="py-1.5 text-right">{formatEuro(r.realisedCents)}{r.draftCents ? <span className="block text-xs font-normal text-muted-foreground">+ {formatEuro(r.draftCents)} concept</span> : null}</td>
                      {data.pipelineVisible && <td className="py-1.5 text-right">{formatEuro(r.pipelineWeightedCents)}</td>}
                      <td className="py-1.5 text-right">{r.standing ? formatEuro(r.standing.missingCents) : "–"}</td>
                      {data.pipelineVisible && <td className={`py-1.5 text-right ${r.standing && r.standing.shortfallCents > 0 ? "text-destructive" : ""}`}>{r.standing ? (r.standing.shortfallCents > 0 ? formatEuro(r.standing.shortfallCents) : "Gehaald") : "–"}</td>}
                      <td className="py-1.5 text-right">
                        {r.standing ? (
                          <div className="ml-auto flex w-28 items-center gap-2" aria-label={`${r.standing.progressPercent} procent`}>
                            <div className="h-2 flex-1 rounded-full bg-muted"><div className="h-2 rounded-full bg-hhc-orange" style={{ width: `${Math.min(100, r.standing.progressPercent)}%` }} /></div>
                            <span className="w-10 text-xs">{r.standing.progressPercent}%</span>
                          </div>
                        ) : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canEdit && <div className="flex flex-wrap items-center gap-3"><Button onClick={save}>Doelen opslaan</Button><span className="text-xs text-muted-foreground">Leeg laten verwijdert het doel. Wijzigingen komen in het logboek, zonder bedragen.</span></div>}
          </CardContent>
        </Card>
      )}

      {data && data.pipelineVisible && (
        <Card>
          <CardHeader><CardTitle>Hoe de pijplijn wordt meegeteld</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Open kansen met een verwachte sluitdatum binnen dit seizoen ({formatDate(data.season.startsOn)} t/m {formatDate(data.season.endsOn)}) tellen mee, gewogen naar fase. Dit zijn schattingen, geen toezeggingen: {data.weights.map((w) => `${STAGE[w.stage] ?? w.stage} ${w.percent}%`).join(", ")}.</p>
            {data.notes.undatedOpportunities > 0 && <p>{data.notes.undatedOpportunities} open kans(en) hebben nog geen verwachte sluitdatum en tellen niet mee.</p>}
            {data.notes.opportunitiesWithoutAmount > 0 && <p>{data.notes.opportunitiesWithoutAmount} kans(en) in dit seizoen hebben nog geen verwacht bedrag en tellen niet mee.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
