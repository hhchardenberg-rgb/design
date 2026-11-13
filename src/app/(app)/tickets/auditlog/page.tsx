import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { auditPage } from "@/lib/tickets/dashboard.server";
import { TICKET_AUDIT_ACTIONS, type TicketAuditAction } from "@/lib/tickets/audit.server";
import { formatDayTime } from "@/lib/date-format";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export const metadata: Metadata = { title: "Auditlog – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ actie?: string; pagina?: string }> }) {
  const a = await ticketsPageAccess("audit:read");
  if (!a.allowed) return <NoAccess what="het auditlog van HHC Tickets" />;
  const sp = await searchParams;
  const action = sp.actie && sp.actie in TICKET_AUDIT_ACTIONS ? sp.actie : undefined;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const d = await auditPage({ action, page });
  const pages = Math.max(1, Math.ceil(d.total / 100));
  const href = (p: number) => `/tickets/auditlog?${new URLSearchParams({ ...(action ? { actie: action } : {}), pagina: String(p) })}`;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Auditlog</h1>
        <p className="mt-1 text-sm text-muted-foreground">Alle belangrijke handelingen in HHC Tickets. Inloggen staat in het auditlog van de Hub (Beheer).</p>
      </div>
      <form className="flex flex-wrap gap-2 text-sm">
        <select name="actie" defaultValue={action ?? ""} className="h-10 rounded-md border border-border bg-surface px-3" aria-label="Soort handeling">
          <option value="">Alle handelingen</option>
          {Object.entries(TICKET_AUDIT_ACTIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-md border border-border px-4 font-semibold hover:bg-surface-muted">
          Filteren
        </button>
      </form>
      <Card>
        <CardContent className="p-0">
          {d.rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nog niets vastgelegd.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-muted text-xs">
                  <tr>
                    <th className="p-2">Tijd</th>
                    <th className="p-2">Handeling</th>
                    <th className="p-2">Door</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Reden</th>
                    <th className="p-2">Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap p-2 tabular-nums">{formatDayTime(r.at)}</td>
                      <td className="p-2">{TICKET_AUDIT_ACTIONS[r.action as TicketAuditAction] ?? r.summary}</td>
                      <td className="p-2">{r.actorName ?? "Systeem"}</td>
                      <td className="whitespace-nowrap p-2 text-xs">{r.oldStatus || r.newStatus ? `${r.oldStatus ?? "–"} → ${r.newStatus ?? "–"}` : ""}</td>
                      <td className="p-2 text-xs">{r.reason ?? ""}</td>
                      <td className="p-2 text-xs">
                        {r.ticketId ? (
                          <Link href={`/tickets/overzicht/${r.ticketId}`} className="text-hhc-orange-dark hover:underline">
                            Bekijken
                          </Link>
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Pagina {page} van {pages}
          </span>
          <div className="flex gap-3">
            {page > 1 && <Link href={href(page - 1)}>Vorige</Link>}
            {page < pages && <Link href={href(page + 1)}>Volgende</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
