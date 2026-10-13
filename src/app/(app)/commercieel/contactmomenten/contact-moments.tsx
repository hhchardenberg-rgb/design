"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TierBadge, TierFilter } from "@/components/commercial/sponsor-tier";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate } from "@/lib/commercial/client";
import { ActivityList } from "@/components/commercial/activity-list";
import type { Permission } from "@/lib/commercial/permissions";

interface Gap { companyId: string; companyName: string; tier: string | null; tierName: string; ownerName: string | null; lastContactOn: string | null; daysSince: number; intervalDays: number; overdueDays: number }
interface Rule { tier: string; name: string; intervalDays: number | null }
interface Data { total: number; rows: Gap[]; rules: Rule[] }

export function ContactMoments({ canManage, permissions }: { canManage: boolean; permissions: Permission[] }) {
  const toast = useStableToast();
  const [data, setData] = useState<Data | null>(null);
  const [tiers, setTiers] = useState<string[]>([]);
  const [mine, setMine] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (tiers.length) qs.set("tiers", tiers.join(","));
    if (mine) qs.set("mine", "1");
    const r = await api<Data>(`/api/commercial/contact-moments?${qs}`);
    if (r.ok) {
      setData(r.data);
      setDraft(Object.fromEntries(r.data.rules.map((x) => [x.tier, x.intervalDays == null ? "" : String(x.intervalDays)])));
    } else toast.error(r.error);
  }, [tiers, mine, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const rules = Object.entries(draft).map(([tier, v]) => ({ tier, intervalDays: v.trim() === "" ? null : Number(v) }));
    if (rules.some((r) => r.intervalDays != null && !Number.isInteger(r.intervalDays))) return toast.error("Vul een heel aantal dagen in, of laat het leeg.");
    const r = await api("/api/commercial/contact-moments", "PUT", { rules });
    if (r.ok) {
      toast.success("Termijnen opgeslagen.");
      await load();
    } else toast.error(r.error);
  }

  if (!data) return <p className="text-sm text-muted-foreground">Laden…</p>;
  const anyRule = data.rules.some((r) => r.intervalDays != null);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Contactmomenten</h1>
        <p className="text-sm text-muted-foreground">Sponsoren waarmee langer dan de ingestelde termijn geen contactmoment is vastgelegd. De eigenaar van het dossier krijgt hierover een herinnering in de dagelijkse mail (uit te zetten in het profiel).</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Termijn per sponsorvorm</CardTitle>
          <CardDescription>Aantal dagen zonder contactmoment waarna een sponsor hier verschijnt. Leeg laten betekent geen herinnering voor die groep. Alleen sponsoren met status “Actief” tellen mee; een geplande afspraak in de toekomst telt als opvolging.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {data.rules.map((r) => (
              <div key={r.tier}>
                <label htmlFor={`rule-${r.tier}`} className="text-sm font-medium">{r.name}</label>
                <div className="flex items-center gap-1.5">
                  <Input id={`rule-${r.tier}`} type="number" inputMode="numeric" min={1} max={1095} placeholder="geen" disabled={!canManage} value={draft[r.tier] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [r.tier]: e.target.value }))} />
                  <span className="text-sm text-muted-foreground">dagen</span>
                </div>
              </div>
            ))}
          </div>
          {canManage ? <Button onClick={save}>Opslaan</Button> : <p className="text-xs text-muted-foreground">Alleen wie commerciële instellingen mag beheren kan de termijnen wijzigen.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-5">
          <TierFilter value={tiers} onChange={setTiers} allowNone />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-hhc-orange" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Alleen mijn dossiers</label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{data.total} sponsor(en) om te spreken</CardTitle></CardHeader>
        <CardContent>
          {data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{anyRule ? "Alle sponsoren binnen deze selectie zijn recent gesproken." : "Er zijn nog geen termijnen ingesteld, dus er worden geen sponsoren gemeld."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-1">Sponsor</th><th className="py-1">Vorm</th><th className="py-1">Eigenaar</th><th className="py-1">Laatst gesproken</th><th className="py-1 text-right">Termijn</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((g) => (
                    <tr key={g.companyId}>
                      <td className="py-1.5"><Link className="font-medium underline" href={`/commercieel/sponsoren/${g.companyId}`}>{g.companyName}</Link></td>
                      <td className="py-1.5"><TierBadge tier={g.tier} /></td>
                      <td className="py-1.5">{g.ownerName ?? <span className="text-muted-foreground">–</span>}</td>
                      <td className="py-1.5">{g.lastContactOn ? `${formatDate(g.lastContactOn)} (${g.daysSince} dagen)` : <span className="text-muted-foreground">nog niet vastgelegd</span>}</td>
                      <td className="py-1.5 text-right text-destructive">{g.overdueDays} dagen over ({g.intervalDays})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Alle contactmomenten</h2>
        <p className="text-sm text-muted-foreground">Zoek in de contactmomenten van alle dossiers die je mag zien. Gearchiveerde momenten staan onder “Gearchiveerd” en zijn daar te herstellen.</p>
        <ActivityList can={(p) => permissions.includes(p)} />
      </div>
    </div>
  );
}
