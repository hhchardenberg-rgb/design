"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { TierBadge } from "@/components/commercial/sponsor-tier";
import { api, formatDate } from "@/lib/commercial/client";

interface Row {
  id: string;
  name: string;
  tradeName: string | null;
  city: string | null;
  sponsorTier: string | null;
  deletedAt: string;
  deletedByLabel: string | null;
  deleteReason: string | null;
}

export function DeletedArchive() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ rows: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    const r = await api<{ rows: Row[] }>(`/api/commercial/deleted-archive${term ? `?q=${encodeURIComponent(term)}` : ""}`);
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else setError(r.error);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Lock className="h-5 w-5" /> Gesloten archief</h1>
        <p className="text-sm text-muted-foreground">
          Verwijderde sponsordossiers, met alles wat eraan vastzat. Alleen beheerders zien deze pagina. Er is niets gewist: open een dossier om het te bekijken of terug te zetten.
        </p>
      </div>
      <div className="max-w-sm">
        <Label htmlFor="archive-q">Zoeken</Label>
        <Input id="archive-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Naam of plaats" />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Sponsor</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Vorm</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Verwijderd op</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Door</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Reden</th>
              </tr>
            </thead>
            <tbody>
              {!data && !error && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Laden…</td></tr>}
              {data && data.rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">{q ? "Geen verwijderde dossiers gevonden." : "Het archief is leeg. Er zijn nog geen dossiers verwijderd."}</td></tr>
              )}
              {data?.rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                  <td className="px-3 py-2">
                    <Link href={`/commercieel/toezicht/archief/${r.id}`} className="font-medium text-hhc-orange-dark hover:underline">{r.name}</Link>
                    {(r.tradeName || r.city) && <div className="text-xs text-muted-foreground">{[r.tradeName, r.city].filter(Boolean).join(" · ")}</div>}
                  </td>
                  <td className="px-3 py-2">{r.sponsorTier ? <TierBadge tier={r.sponsorTier} /> : <span className="text-muted-foreground">–</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(r.deletedAt, true)}</td>
                  <td className="px-3 py-2">{r.deletedByLabel ?? "Onbekend"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.deleteReason ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
