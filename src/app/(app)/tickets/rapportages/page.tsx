import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDayTime } from "@/lib/date-format";
import { prisma } from "@/lib/prisma";
import { loadTicketsAccess } from "@/lib/tickets/authz.server";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { eventReport } from "@/lib/tickets/reports.server";

export const metadata: Metadata = { title: "Rapportages – HHC Tickets" };
export const dynamic = "force-dynamic";

const Stat = ({ label, value }: { label: string; value: number | string }) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </CardContent>
  </Card>
);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ wedstrijd?: string }> }) {
  const a = await ticketsPageAccess("reports:read");
  if (!a.allowed) return <NoAccess what="de rapportages van HHC Tickets" />;
  const sp = await searchParams;
  const events = await prisma.ticketEvent.findMany({ orderBy: { startsAt: "desc" }, take: 40, select: { id: true, title: true, startsAt: true } });
  const eventId = sp.wedstrijd && events.some((e) => e.id === sp.wedstrijd) ? sp.wedstrijd : events[0]?.id;
  const access = await loadTicketsAccess(a.userId);
  const rep = eventId ? await eventReport({ id: a.userId, name: "", access }, eventId) : null;
  const canExport = a.can("exports:export");
  const max = Math.max(1, ...(rep?.timeline.map((t) => t.count) ?? [1]));
  const dl = (kind: string, formaat: string, label: string) => (
    <a key={`${kind}${formaat}`} href={`/api/tickets/export?soort=${kind}&formaat=${formaat}&wedstrijd=${eventId}`} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
      {label}
    </a>
  );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Rapportages</h1>
        <p className="mt-1 text-sm text-muted-foreground">Toegang per wedstrijd. Zonder persoonsgegevens. Omzet staat er niet in: HHC-tickets zijn gratis en betaalgegevens van Fullhouse worden niet bewaard.</p>
      </div>
      <form className="flex flex-wrap gap-2 text-sm">
        <select name="wedstrijd" defaultValue={eventId} className="h-10 rounded-md border border-border bg-surface px-3" aria-label="Wedstrijd">
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} ({formatDayTime(e.startsAt)})
            </option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-md border border-border px-4 font-semibold hover:bg-surface-muted">
          Tonen
        </button>
      </form>
      {!rep && <p className="text-sm text-muted-foreground">Er zijn nog geen wedstrijden.</p>}
      {rep && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Binnen (personen)" value={rep.inside} />
            <Stat label="HHC-tickets uitgegeven" value={rep.hhc.issued} />
            <Stat label="HHC-tickets nog niet gescand" value={rep.hhc.notYetScanned} />
            <Stat label="Fullhouse geldig / binnen" value={rep.fullhouse.linked ? `${rep.fullhouse.valid} / ${rep.fullhouse.admitted}` : "geen koppeling"} />
            <Stat label="Waarschuwingen" value={rep.scans.warnings} />
            <Stat label="Afgewezen" value={rep.scans.invalid} />
            <Stat label="Overrides" value={rep.scans.overrides} />
            <Stat label="Offline gescand" value={rep.scans.offline} />
          </div>
          {canExport && (
            <div className="flex flex-wrap gap-2">
              {dl("rapport", "pdf", "Rapport (PDF)")}
              {dl("rapport", "xlsx", "Rapport (Excel)")}
              {a.can("tickets:read") && dl("tickets", "csv", "Tickets (CSV)")}
              {a.can("tickets:read") && dl("tickets", "xlsx", "Tickets (Excel)")}
              {a.can("scan:history") && dl("scans", "csv", "Scans (CSV)")}
              {a.can("scan:history") && dl("scans", "xlsx", "Scans (Excel)")}
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per tickettype (HHC)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">Type</th>
                    <th className="p-3">Categorie</th>
                    <th className="p-3">Uitgegeven</th>
                    <th className="p-3">Binnen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rep.byType.map((t) => (
                    <tr key={t.name}>
                      <td className="p-3">{t.name}</td>
                      <td className="p-3">{t.categoryLabel}</td>
                      <td className="p-3 tabular-nums">{t.issued}</td>
                      <td className="p-3 tabular-nums">{t.admitted}</td>
                    </tr>
                  ))}
                  {rep.byType.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        Geen HHC-tickets voor deze wedstrijd.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
          {rep.timeline.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Binnenkomst per kwartier</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {rep.timeline.map((t) => (
                  <div key={t.at} className="flex items-center gap-2 text-xs">
                    <span className="w-28 tabular-nums text-muted-foreground">{formatDayTime(t.at)}</span>
                    <div className="h-3 rounded bg-primary" style={{ width: `${Math.max(2, (t.count / max) * 100)}%` }} />
                    <span className="tabular-nums">{t.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {rep.byEntrance.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Per ingang</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {rep.byEntrance.map((e) => (
                  <span key={e.name}>
                    {e.name}: <b>{e.count}</b>
                  </span>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
