import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Clock, QrCode, ScanLine, ShieldAlert, Ticket, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NoAccess } from "@/components/commercial/no-access";
import { formatDayTime } from "@/lib/date-format";
import { dashboardData } from "@/lib/tickets/dashboard.server";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { TICKETS_ROADMAP } from "@/lib/tickets/navigation";
import { TICKET_CATEGORIES, EVENT_STATUS_LABELS, type EventStatus, type TicketCategory } from "@/lib/tickets/rules";

export const metadata: Metadata = { title: "HHC Tickets" };
export const dynamic = "force-dynamic";

function Stat({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: typeof Ticket; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hhc-orange/10 text-hhc-orange-dark">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function TicketsDashboard() {
  const a = await ticketsPageAccess("dashboard:read");
  if (!a.allowed) {
    // Een scanner heeft geen dashboard; de scanner zelf komt in fase 3.
    return <NoAccess what="het dashboard van HHC Tickets" />;
  }
  const d = await dashboardData();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">HHC Tickets</h1>
        <p className="mt-1 text-sm text-muted-foreground">Eigen tickets van HHC Hardenberg, naast de betaalde tickets van Fullhouse.</p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Uitgegeven HHC-tickets (geldig)" value={d.tickets.active} icon={Ticket} />
        <Stat label="Seizoenskaarten (geldig)" value={d.tickets.seasonCards} icon={QrCode} />
        <Stat label="Geblokkeerd / geannuleerd" value={`${d.tickets.blocked} / ${d.tickets.cancelled}`} icon={ShieldAlert} />
        <Stat label="Verlopen" value={d.tickets.expired} icon={Clock} />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Fullhouse-tickets" value="–" icon={Ticket} hint="Volgt met de Fullhouse-koppeling (fase 4)" />
        <Stat label="Gescand / aanwezig" value="–" icon={ScanLine} hint="Volgt met de scanner (fase 3)" />
        <Stat label="Dubbele / ongeldige scans" value="–" icon={ShieldAlert} hint="Volgt met de scanner (fase 3)" />
        <Stat label="Live bezoekers per ingang" value="–" icon={Users} hint="Volgt met de scanner (fase 3)" />
      </section>

      {d.pendingBatches > 0 && a.can("bulk:approve") && (
        <Card className="border-hhc-orange/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span>
              Er {d.pendingBatches === 1 ? "wacht 1 bulkuitgifte" : `wachten ${d.pendingBatches} bulkuitgiftes`} op goedkeuring.
            </span>
            <Link href="/tickets/goedkeuringen" className="font-semibold text-hhc-orange-dark hover:underline">
              Bekijken
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-hhc-orange-dark" /> Komende wedstrijden
            </CardTitle>
            <CardDescription>Met het aantal geldige losse tickets per wedstrijd (seizoenskaarten niet meegeteld).</CardDescription>
          </CardHeader>
          <CardContent>
            {d.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen wedstrijden gepland.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {d.upcoming.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDayTime(e.startsAt)} · {EVENT_STATUS_LABELS[e.status as EventStatus] ?? e.status}
                        {e.allowReentry ? " · herintrede seizoenskaarten" : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{e.singleTickets}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Geldige tickets per categorie</CardTitle>
          </CardHeader>
          <CardContent>
            {d.byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen tickets uitgegeven.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.byCategory.map((c) => {
                  const max = Math.max(...d.byCategory.map((x) => x.count));
                  return (
                    <li key={c.category}>
                      <div className="flex justify-between">
                        <span>{TICKET_CATEGORIES[c.category as TicketCategory]}</span>
                        <span className="font-semibold tabular-nums">{c.count}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-surface-muted">
                        <div className="h-1.5 rounded-full bg-hhc-orange" style={{ width: `${(c.count / max) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wat komt er nog</CardTitle>
          <CardDescription>HHC Tickets wordt in fases gebouwd. Dit is het fundament (fase 1).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TICKETS_ROADMAP.map((r) => (
            <div key={r.phase}>
              <p className="text-sm font-semibold">
                Fase {r.phase}: {r.title}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                {r.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
