"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api, formatDate, formatEuro } from "@/lib/commercial/client";
import { TierBadge, TierFilter } from "@/components/commercial/sponsor-tier";
import { seasonOptionLabel } from "@/lib/commercial/season-phase";

interface Row { id: string; companyId: string; companyName: string; sponsorTier: string | null; seasonName: string; packageName: string | null; status: string; endsOn: string; noticeUntil: string | null; amountCents: number | null; amountVisible: boolean }
interface Season { id: string; name: string; startsOn: string; endsOn: string }
const STATUS: Record<string, string> = { DRAFT: "Concept", ACTIVE: "Lopend", ENDED: "Beëindigd", CANCELLED: "Geannuleerd" };

export function ContractOverview() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [status, setStatus] = useState("");
  const [expiring, setExpiring] = useState(false);
  const [tiers, setTiers] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; pageSize: number; rows: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ seasons: Season[] }>("/api/commercial/seasons").then((r) => r.ok && setSeasons(r.data.seasons));
  }, []);
  const load = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page) });
    if (seasonId) q.set("seasonId", seasonId);
    if (status) q.set("status", status);
    if (expiring) q.set("expiring", "90");
    if (tiers.length) q.set("tiers", tiers.join(","));
    const r = await api<{ total: number; pageSize: number; rows: Row[] }>(`/api/commercial/contracts?${q}`);
    if (r.ok) { setData(r.data); setError(null); } else setError(r.error);
  }, [seasonId, status, expiring, tiers, page]);
  useEffect(() => {
    void load();
  }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const showAmount = data?.rows.some((r) => r.amountVisible);
  const reset = (fn: () => void) => { fn(); setPage(1); };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Contracten</h1>
        <p className="text-sm text-muted-foreground">Alle sponsorcontracten binnen jouw bereik. Een contract maak je aan in het dossier van de sponsor.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Seizoen<select className="mt-1 block h-10 rounded-md border border-border bg-surface px-2" value={seasonId} onChange={(e) => reset(() => setSeasonId(e.target.value))}><option value="">Alle</option>{seasons.map((s) => <option key={s.id} value={s.id}>{seasonOptionLabel(s)}</option>)}</select></label>
        <label>Status<select className="mt-1 block h-10 rounded-md border border-border bg-surface px-2" value={status} onChange={(e) => reset(() => setStatus(e.target.value))}><option value="">Alle</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="flex items-center gap-2 pb-2"><input type="checkbox" className="h-4 w-4 accent-hhc-orange" checked={expiring} onChange={(e) => reset(() => setExpiring(e.target.checked))} /> Loopt af of opzegtermijn binnen 90 dagen</label>
        <TierFilter value={tiers} onChange={(v) => reset(() => setTiers(v))} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-3 py-2 text-left font-medium">Sponsor</th><th className="px-3 py-2 text-left font-medium">Vorm</th><th className="px-3 py-2 text-left font-medium">Seizoen</th><th className="px-3 py-2 text-left font-medium">Pakket</th><th className="px-3 py-2 text-left font-medium">Status</th><th className="px-3 py-2 text-left font-medium">Einde</th>{showAmount && <th className="px-3 py-2 text-right font-medium">Bedrag</th>}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data ? <tr><td className="p-4 text-muted-foreground" colSpan={7}>Laden…</td></tr> : data.rows.length === 0 ? <tr><td className="p-4 text-muted-foreground" colSpan={7}>Geen contracten gevonden.</td></tr> : data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2"><Link className="font-medium underline" href={`/commercieel/sponsoren/${r.companyId}`}>{r.companyName}</Link></td>
                  <td className="px-3 py-2"><TierBadge tier={r.sponsorTier} /></td><td className="px-3 py-2">{r.seasonName}</td><td className="px-3 py-2">{r.packageName ?? "–"}</td>
                  <td className="px-3 py-2"><Badge variant={r.status === "ACTIVE" ? "success" : "outline"}>{STATUS[r.status]}</Badge></td>
                  <td className="px-3 py-2">{formatDate(r.endsOn)}{r.noticeUntil ? ` (opzeggen voor ${formatDate(r.noticeUntil)})` : ""}</td>
                  {showAmount && <td className="px-3 py-2 text-right">{formatEuro(r.amountCents)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
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
