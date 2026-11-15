import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Clock, QrCode, ScanLine, ShieldAlert, Ticket, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NoAccess } from "@/components/commercial/no-access";
import { formatDayTime } from "@/lib/date-format";
import { dashboardData } from "@/lib/tickets/dashboard.server";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { TICKETS_NAV, TICKETS_ROADMAP } from "@/lib/tickets/navigation";
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
    // Een scanner heeft geen dashboard; die werkt in /scan.
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

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {d.focus ? (
              <>
                {d.focus.live ? "Nu bezig" : new Date(d.focus.startsAt) > new Date() ? "Eerstvolgende wedstrijd" : "Laatst gespeeld"}: {d.focus.title}{" "}
                <span className="font-normal text-muted-foreground">({formatDayTime(d.focus.startsAt)})</span>
              </>
            ) : (
              "Geen wedstrijd in de komende of afgelopen 14 dagen"
            )}
          </h2>
          {d.focus && a.can("scan:history") && (
            <Link href="/tickets/wedstrijddag" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Wedstrijddag live openen
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Fullhouse-tickets (geldig)"
            value={d.focus?.fullhouse ?? d.fullhouseUpcoming}
            icon={Ticket}
            hint={d.focus?.fullhouse != null ? "voor deze wedstrijd" : "in de komende wedstrijden"}
          />
          <Stat label="Binnen (unieke tickets)" value={d.focus ? d.focus.inside : "–"} icon={ScanLine} hint={d.focus?.capacity ? `van ${d.focus.capacity} plaatsen` : "geldige eerste scans"} />
          <Stat label="Dubbele / ongeldige scans" value={d.focus ? `${d.focus.warnings} / ${d.focus.invalid}` : "–"} icon={ShieldAlert} hint="waarschuwing / geweigerd" />
          <Stat
            label="Scans per ingang"
            value={d.focus?.byEntrance.length ? d.focus.byEntrance.reduce((n, e) => n + e.count, 0) : 0}
            icon={Users}
            hint={d.focus?.byEntrance.length ? d.focus.byEntrance.slice(0, 3).map((e) => `${e.name} ${e.count}`).join(" · ") : "nog geen scans"}
          />
        </div>
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
            <CardDescription>Met het aantal geldige losse HHC-tickets per wedstrijd (seizoenskaarten niet meegeteld) en de geldige Fullhouse-tickets.</CardDescription>
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
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="font-semibold">{e.singleTickets}</span>
                      {e.fullhouseTickets != null && <span className="block text-xs text-muted-foreground">+ {e.fullhouseTickets} Fullhouse</span>}
                    </span>
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
          <CardTitle className="text-base">Snel naar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TICKETS_NAV.map((g) => {
            const items = g.items.filter((i) => a.can(i.requires));
            if (!items.length) return null;
            return (
              <div key={g.id}>
                <p className="text-sm font-semibold">{g.label}</p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {items.map((i) => (
                    <li key={i.href}>
                      <Link href={i.href} className="text-hhc-orange-dark hover:underline">
                        {i.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nog niet gebouwd</CardTitle>
          <CardDescription>Alles hierboven werkt. Dit staat nog op de lijst.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {TICKETS_ROADMAP.map((r) => (
            <div key={r.title}>
              <p className="text-sm font-semibold">{r.title}</p>
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
