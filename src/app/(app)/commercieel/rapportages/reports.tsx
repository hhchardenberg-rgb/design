"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatEuro } from "@/lib/commercial/client";

interface Season { id: string; name: string }
interface Report {
  season: { season: Season; byStatus: { status: string; count: number; totalCents: number | null }[]; byPackage: { name: string; count: number; totalCents: number | null }[]; activeWithoutAmount: number | null };
  pipeline: { stages: { stage: string; count: number; expectedCents: number | null }[] } | null;
}

const STATUS: Record<string, string> = { ACTIVE: "Lopend", DRAFT: "Concept", ENDED: "Afgelopen", CANCELLED: "Geannuleerd" };
const STAGE: Record<string, string> = { LEAD: "Lead", CONTACTED: "Gesproken", PROPOSAL: "Voorstel", NEGOTIATION: "Onderhandeling", WON: "Gewonnen", LOST: "Verloren" };

export function Reports({ canExport, canCompanies, canContracts }: { canExport: boolean; canCompanies: boolean; canContracts: boolean }) {
  const toast = useStableToast();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    void api<{ seasons: Season[] }>("/api/commercial/seasons").then((r) => {
      if (!r.ok) return;
      setSeasons(r.data.seasons);
    });
  }, []);
  useEffect(() => {
    if (!seasonId) return;
    void api<Report>(`/api/commercial/reports?seasonId=${encodeURIComponent(seasonId)}`).then((r) => (r.ok ? setReport(r.data) : toast.error(r.error)));
  }, [seasonId, toast]);

  const amountsShown = report?.season.byStatus.some((s) => s.totalCents != null);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Rapportages</h1>
        <p className="text-sm text-muted-foreground">Inkomsten per seizoen en de stand van de pijplijn, binnen de dossiers die jij mag zien. Bedragen zijn exclusief btw en alleen zichtbaar met bedragenrechten.</p>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <div>
            <label htmlFor="rp-season" className="text-sm font-medium">Seizoen</label>
            <select id="rp-season" className="block h-10 rounded-md border border-border bg-surface px-2 text-sm" value={seasonId} onChange={(e) => { setSeasonId(e.target.value); setReport(null); }}>
              <option value="">Kies…</option>{seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {canExport && canContracts && <a className="inline-flex h-10 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted" href={`/api/commercial/export?kind=contracts${seasonId ? `&seasonId=${encodeURIComponent(seasonId)}` : ""}`}>Contracten exporteren (CSV)</a>}
          {canExport && canCompanies && <a className="inline-flex h-10 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted" href="/api/commercial/export?kind=companies">Sponsoren exporteren (CSV)</a>}
        </CardContent>
      </Card>
      {report && (
        <>
          <Card>
            <CardHeader><CardTitle>Contracten {report.season.season.name}</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-1">Status</th><th className="py-1 text-right">Aantal</th>{amountsShown && <th className="py-1 text-right">Bedrag</th>}</tr></thead>
                <tbody className="divide-y divide-border">
                  {report.season.byStatus.map((s) => <tr key={s.status}><td className="py-1.5">{STATUS[s.status] ?? s.status}</td><td className="py-1.5 text-right">{s.count}</td>{amountsShown && <td className="py-1.5 text-right">{formatEuro(s.totalCents)}</td>}</tr>)}
                </tbody>
              </table>
              {report.season.activeWithoutAmount ? <p className="mt-2 text-xs text-muted-foreground">{report.season.activeWithoutAmount} lopend(e) contract(en) hebben nog geen bedrag en tellen niet mee in het totaal.</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Lopende contracten per pakket</CardTitle></CardHeader>
            <CardContent>
              {report.season.byPackage.length === 0 ? <p className="text-sm text-muted-foreground">Geen lopende contracten in dit seizoen.</p> : (
                <table className="w-full text-sm"><tbody className="divide-y divide-border">
                  {report.season.byPackage.map((p) => <tr key={p.name}><td className="py-1.5">{p.name}</td><td className="py-1.5 text-right">{p.count}</td>{amountsShown && <td className="py-1.5 text-right">{formatEuro(p.totalCents)}</td>}</tr>)}
                </tbody></table>
              )}
            </CardContent>
          </Card>
          {report.pipeline && (
            <Card>
              <CardHeader><CardTitle>Pijplijn</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm"><tbody className="divide-y divide-border">
                  {report.pipeline.stages.map((s) => <tr key={s.stage}><td className="py-1.5">{STAGE[s.stage] ?? s.stage}</td><td className="py-1.5 text-right">{s.count}</td>{s.expectedCents != null && <td className="py-1.5 text-right">{formatEuro(s.expectedCents)}</td>}</tr>)}
                </tbody></table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
