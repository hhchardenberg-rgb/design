import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/commercial/no-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDayTime } from "@/lib/date-format";
import { prisma } from "@/lib/prisma";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { scanHistory, scanStats } from "@/lib/tickets/scan.server";

export const metadata: Metadata = { title: "Scanhistorie – HHC Tickets" };
export const dynamic = "force-dynamic";

const RESULT = { VALID: "Geldig", WARNING: "Waarschuwing", INVALID: "Afgewezen" } as const;
const TONE = { VALID: "text-success", WARNING: "text-amber-600", INVALID: "text-destructive" } as const;

export default async function ScansPage({ searchParams }: { searchParams: Promise<{ wedstrijd?: string; uitslag?: string; pagina?: string }> }) {
  const a = await ticketsPageAccess("scan:history");
  if (!a.allowed) return <NoAccess what="de scanhistorie van HHC Tickets" />;
  const sp = await searchParams;
  const events = await prisma.ticketEvent.findMany({ orderBy: { startsAt: "desc" }, take: 40, select: { id: true, title: true, startsAt: true } });
  const eventId = sp.wedstrijd && events.some((e) => e.id === sp.wedstrijd) ? sp.wedstrijd : events[0]?.id;
  const result = sp.uitslag && sp.uitslag in RESULT ? sp.uitslag : undefined;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const [stats, hist] = eventId ? await Promise.all([scanStats(eventId), scanHistory({ eventId, result, page })]) : [null, null];
  const pages = hist ? Math.max(1, Math.ceil(hist.total / 100)) : 1;
  const href = (p: number) => `/tickets/scans?${new URLSearchParams({ ...(eventId ? { wedstrijd: eventId } : {}), ...(result ? { uitslag: result } : {}), pagina: String(p) })}`;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Scanhistorie</h1>
        <p className="mt-1 text-sm text-muted-foreground">Elke scanpoging, ook mislukte. Namen staan hier alleen als initialen.</p>
      </div>
      <form className="flex flex-wrap gap-2 text-sm">
        <select name="wedstrijd" defaultValue={eventId} className="h-10 rounded-md border border-border bg-surface px-3" aria-label="Wedstrijd">
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} ({formatDayTime(e.startsAt)})
            </option>
          ))}
        </select>
        <select name="uitslag" defaultValue={result ?? ""} className="h-10 rounded-md border border-border bg-surface px-3" aria-label="Uitslag">
          <option value="">Alle uitslagen</option>
          {Object.entries(RESULT).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-md border border-border px-4 font-semibold hover:bg-surface-muted">
          Tonen
        </button>
      </form>
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Binnen (personen)", stats.inside],
            ["Geldige scans", stats.valid],
            ["Waarschuwingen", stats.warnings],
            ["Afgewezen", stats.invalid],
          ].map(([l, v]) => (
            <Card key={String(l)}>
              <CardContent className="p-4">
                <p className="text-2xl font-bold tabular-nums">{v}</p>
                <p className="text-xs text-muted-foreground">{l}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {stats && stats.byEntrance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per ingang en bron</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {stats.byEntrance.map((e) => (
              <span key={e.name}>
                {e.name}: <b>{e.count}</b>
              </span>
            ))}
            {stats.bySource.map((s) => (
              <span key={s.source}>
                {s.source === "HHC" ? "HHC-tickets" : "Fullhouse"}: <b>{s.count}</b>
              </span>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Tijd</th>
                <th className="p-3">Uitslag</th>
                <th className="p-3">Ticket</th>
                <th className="p-3">Ingang / scanner</th>
                <th className="p-3">Opmerking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {hist?.rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3 tabular-nums">{formatDayTime(r.at)}</td>
                  <td className={`p-3 font-medium ${TONE[r.result as keyof typeof TONE]}`}>{RESULT[r.result as keyof typeof RESULT] ?? r.result}{r.reason ? ` · ${r.reason}` : ""}</td>
                  <td className="p-3">
                    {r.ticketId ? <Link className="underline" href={`/tickets/overzicht/${r.ticketId}`}>{r.label ?? "Ticket"}</Link> : r.label ?? "–"}
                    <span className="ml-1 text-xs text-muted-foreground">{r.source === "FULLHOUSE" ? "Fullhouse" : ""}</span>
                  </td>
                  <td className="p-3">{[r.entrance, r.scanner].filter(Boolean).join(" · ") || "–"}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {r.overridden ? `Override: ${r.overrideReason}` : ""} {r.offline ? "offline" : ""} {r.note ?? ""}
                  </td>
                </tr>
              ))}
              {hist?.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    Nog geen scans voor deze selectie.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(page - 1)} className="underline">Vorige</Link> : <span />}
          <span className="text-muted-foreground">Pagina {page} van {pages}</span>
          {page < pages ? <Link href={href(page + 1)} className="underline">Volgende</Link> : <span />}
        </div>
      )}
    </div>
  );
}
