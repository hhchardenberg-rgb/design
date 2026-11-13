import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDay } from "@/lib/date-format";
import { loadTicketsAccess } from "@/lib/tickets/authz.server";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { seasonTrends } from "@/lib/tickets/trends.server";

export const metadata: Metadata = { title: "Trends – HHC Tickets" };
export const dynamic = "force-dynamic";

const Stat = ({ label, value, hint }: { label: string; value: number | string; hint?: string }) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </CardContent>
  </Card>
);

export default async function TrendsPage({ searchParams }: { searchParams: Promise<{ seizoen?: string }> }) {
  const a = await ticketsPageAccess("reports:read");
  if (!a.allowed) return <NoAccess what="de trends van HHC Tickets" />;
  const sp = await searchParams;
  const access = await loadTicketsAccess(a.userId);
  const t = await seasonTrends({ id: a.userId, name: "", access }, sp.seizoen);
  if (!t.season || !t.summary) return <p className="text-sm text-muted-foreground">Er zijn nog geen seizoenen ingesteld.</p>;
  const max = Math.max(1, ...t.games.map((g) => Math.max(g.sold, g.admitted)));
  const s = t.summary;
  const title = (id: string | null) => t.games.find((g) => g.id === id)?.title ?? "–";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Trends per seizoen</h1>
        <p className="mt-1 text-sm text-muted-foreground">Opkomst per duel: hoeveel tickets er waren en hoeveel mensen zijn binnengekomen. Alleen aantallen, geen persoonsgegevens. Verkocht telt HHC-tickets en tickets uit Fullhouse (alleen geldige).</p>
      </div>
      <form className="flex flex-wrap gap-2 text-sm">
        <select name="seizoen" defaultValue={t.season.id} className="h-10 rounded-md border border-border bg-surface px-3" aria-label="Seizoen">
          {t.seasons.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-md border border-border px-4 font-semibold hover:bg-surface-muted">Tonen</button>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Gespeelde duels met tickets" value={`${s.pastGames} van ${s.games}`} />
        <Stat label="Bezoekers samen" value={s.totalAdmitted} />
        <Stat label="Gemiddeld per duel" value={s.averageAdmitted ?? "–"} />
        <Stat label="Gemiddelde opkomst" value={s.averagePct == null ? "–" : `${s.averagePct}%`} hint="van uitgegeven tickets" />
        <Stat label="Best bezocht" value={s.bestId ? (t.games.find((g) => g.id === s.bestId)?.admitted ?? 0) : "–"} hint={title(s.bestId)} />
        <Stat label="Minst bezocht" value={s.worstId ? (t.games.find((g) => g.id === s.worstId)?.admitted ?? 0) : "–"} hint={title(s.worstId)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verkocht en binnengekomen per duel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {t.games.length === 0 && <p className="text-sm text-muted-foreground">Geen duels in dit seizoen.</p>}
          {t.games.map((g) => (
            <div key={g.id} className="space-y-1 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-foreground">{g.title}</span>
                <span className="tabular-nums text-muted-foreground">{formatDay(g.startsAt)}{g.past ? "" : " · nog te spelen"}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 rounded bg-border" style={{ width: `${Math.max(2, (g.sold / max) * 100)}%` }} title={`Verkocht: ${g.sold}`} />
                <span className="tabular-nums">{g.sold}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 rounded bg-primary" style={{ width: `${Math.max(2, (g.admitted / max) * 100)}%` }} title={`Binnen: ${g.admitted}`} />
                <span className="tabular-nums">{g.admitted}{g.pct != null && g.past ? ` (${g.pct}%)` : ""}</span>
              </div>
            </div>
          ))}
          <p className="flex gap-4 pt-1 text-xs text-muted-foreground"><span><span className="mr-1 inline-block h-2 w-3 rounded bg-border" />verkocht of uitgegeven</span><span><span className="mr-1 inline-block h-2 w-3 rounded bg-primary" />binnengekomen</span></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vergelijking tussen duels</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr><th className="p-3">Duel</th><th className="p-3">Datum</th><th className="p-3">Verkocht</th><th className="p-3">Binnen</th><th className="p-3">Opkomst</th><th className="p-3">t.o.v. gemiddelde</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {t.games.map((g) => (
                <tr key={g.id}>
                  <td className="p-3">{g.title}</td>
                  <td className="p-3 tabular-nums">{formatDay(g.startsAt)}</td>
                  <td className="p-3 tabular-nums">{g.sold}</td>
                  <td className="p-3 tabular-nums">{g.admitted}</td>
                  <td className="p-3 tabular-nums">{g.past && g.pct != null ? `${g.pct}%` : "–"}</td>
                  <td className="p-3 tabular-nums">{g.deltaToAverage == null ? "–" : `${g.deltaToAverage > 0 ? "+" : ""}${g.deltaToAverage}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vergelijking tussen seizoenen</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr><th className="p-3">Seizoen</th><th className="p-3">Gespeelde duels</th><th className="p-3">Bezoekers samen</th><th className="p-3">Gemiddeld per duel</th><th className="p-3">Gemiddelde opkomst</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {t.compare.map((c) => (
                <tr key={c.id} className={c.id === t.season!.id ? "bg-surface-muted font-medium" : ""}>
                  <td className="p-3">{c.name}</td>
                  <td className="p-3 tabular-nums">{c.pastGames}</td>
                  <td className="p-3 tabular-nums">{c.totalAdmitted}</td>
                  <td className="p-3 tabular-nums">{c.averageAdmitted ?? "–"}</td>
                  <td className="p-3 tabular-nums">{c.averagePct == null ? "–" : `${c.averagePct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
