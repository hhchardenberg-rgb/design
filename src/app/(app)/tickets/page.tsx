import type { Metadata } from "next";
import Link from "next/link";
import { Activity, CalendarDays, ChartColumn, Clock, Layers, ListChecks, Plus, QrCode, ScanLine, ShieldAlert, Ticket, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatStrip } from "@/components/dashboard/stat-strip";
import { NoAccess } from "@/components/commercial/no-access";
import { formatDayTime } from "@/lib/date-format";
import { dashboardData } from "@/lib/tickets/dashboard.server";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { TICKET_CATEGORIES, EVENT_STATUS_LABELS, type EventStatus, type TicketCategory } from "@/lib/tickets/rules";
import type { TicketPermission } from "@/lib/tickets/permissions";

export const metadata: Metadata = { title: "HHC Tickets" };
export const dynamic = "force-dynamic";

// De belangrijkste acties, als compacte rij knoppen bovenaan. De rest staat in het menu.
const QUICK_ACTIONS: { href: string; label: string; icon: typeof Ticket; requires: TicketPermission; primary?: boolean }[] = [
  { href: "/tickets/uitgeven", label: "Ticket uitgeven", icon: Plus, requires: "tickets:issue", primary: true },
  { href: "/tickets/bulk", label: "Bulkuitgifte", icon: Layers, requires: "tickets:bulk" },
  { href: "/tickets/overzicht", label: "Ticketoverzicht", icon: ListChecks, requires: "tickets:read" },
  { href: "/scan", label: "Scanner", icon: ScanLine, requires: "scan:scan" },
  { href: "/tickets/wedstrijddag", label: "Wedstrijddag live", icon: Activity, requires: "scan:history" },
  { href: "/tickets/wedstrijden", label: "Wedstrijden", icon: CalendarDays, requires: "events:read" },
  { href: "/tickets/rapportages", label: "Rapportages", icon: ChartColumn, requires: "reports:read" },
];

export default async function TicketsDashboard() {
  const a = await ticketsPageAccess("dashboard:read");
  if (!a.allowed) {
    // Een scanner heeft geen dashboard; die werkt in /scan.
    return <NoAccess what="het dashboard van HHC Tickets" />;
  }
  const d = await dashboardData();
  const quickActions = QUICK_ACTIONS.filter((q) => a.can(q.requires));
  const focusWhen = d.focus ? (d.focus.live ? "Nu bezig" : new Date(d.focus.startsAt) > new Date() ? "Eerstvolgende wedstrijd" : "Laatst gespeeld") : null;
  const focusStats = d.focus
    ? [
        { label: "Fullhouse-tickets", value: d.focus.fullhouse ?? d.fullhouseUpcoming, hint: d.focus.fullhouse != null ? "geldig voor deze wedstrijd" : "in de komende wedstrijden" },
        { label: "Binnen", value: d.focus.inside, hint: d.focus.capacity ? `van ${d.focus.capacity} plaatsen` : "unieke geldige eerste scans" },
        { label: "Dubbel / ongeldig", value: `${d.focus.warnings} / ${d.focus.invalid}`, hint: "waarschuwing / geweigerd" },
        {
          label: "Scans per ingang",
          value: d.focus.byEntrance.reduce((n, e) => n + e.count, 0),
          hint: d.focus.byEntrance.length ? d.focus.byEntrance.slice(0, 3).map((e) => `${e.name} ${e.count}`).join(" · ") : "nog geen scans",
        },
      ]
    : [];
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="HHC Tickets"
        title="Dashboard"
        description="Eigen tickets van HHC Hardenberg, naast de betaalde tickets van Fullhouse."
      >
        {quickActions.length > 0 && (
            <nav aria-label="Snelle acties" className="flex flex-wrap gap-2">
              {quickActions.map(({ href, label, icon: Icon, primary }) => (
                <Link key={href} href={href} className={buttonVariants({ variant: primary ? "primary" : "outline", size: "sm" })}>
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              ))}
            </nav>
        )}
      </PageHeader>

      <StatStrip
        items={[
          { label: "Uitgegeven HHC-tickets", value: d.tickets.active, hint: "geldig" },
          { label: "Seizoenskaarten", value: d.tickets.seasonCards, hint: "geldig" },
          { label: "Geblokkeerd / geannuleerd", value: `${d.tickets.blocked} / ${d.tickets.cancelled}` },
          { label: "Verlopen", value: d.tickets.expired },
        ]}
      />

      <section aria-label="Wedstrijd in beeld" className="relative overflow-hidden rounded-xl bg-secondary text-white">
        <div className="relative flex flex-wrap items-end justify-between gap-4 border-b border-white/10 px-6 pt-6 pb-5 sm:px-8">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2 text-[#8f8d87]">
              {d.focus?.live && <span className="h-2 w-2 animate-pulse rounded-full bg-hhc-orange" aria-hidden />}
              {focusWhen ?? "Wedstrijd in beeld"}
            </p>
            <p className="mt-2 font-heading text-[1.625rem] leading-tight font-bold">{d.focus ? d.focus.title : "Geen wedstrijd in de komende of afgelopen 14 dagen"}</p>
            {d.focus && <p className="mt-1 text-sm text-white/65">{formatDayTime(d.focus.startsAt)}</p>}
          </div>
          {d.focus && a.can("scan:history") && (
            <Link href="/tickets/wedstrijddag" className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-sm font-semibold text-black transition-colors hover:bg-hhc-orange">
              <Activity className="h-4 w-4" /> Wedstrijddag live
            </Link>
          )}
          <span aria-hidden className="absolute bottom-0 left-0 h-[3px] w-1/3 bg-hhc-orange" />
        </div>
        {d.focus && (
          <div className="relative grid grid-cols-2 lg:grid-cols-4">
            {focusStats.map((f, i) => (
              <div key={f.label} className={`px-6 py-5 sm:px-8 ${i % 2 === 1 ? "border-l border-white/10" : ""} ${i >= 2 ? "border-t border-white/10 lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
                <p className="text-[0.8125rem] text-white/60">{f.label}</p>
                <p className="stat-number mt-2 text-[2rem]">{f.value}</p>
                <p className="mt-1 truncate text-xs text-white/50">{f.hint}</p>
              </div>
            ))}
          </div>
        )}
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

    </div>
  );
}
