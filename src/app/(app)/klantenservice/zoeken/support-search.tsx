"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Search, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { api, errorText } from "@/components/tickets/parts";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { formatDay, formatDayTime } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { SUPPORT_KIND_LABELS, SUPPORT_STATUS_LABELS, type SupportSearchKind, type SupportStatus } from "@/lib/tickets/support-search";

// Zoektool in Klantenservice. De zoekterm blijft in het geheugen van deze pagina: niet in de
// URL en niet in de browseropslag. Verlaat je de pagina, dan zijn de resultaten weg.

interface Scan {
  at: string;
  result: string;
  reason: string | null;
  event: string | null;
  where: string | null;
  reentry: boolean;
  overridden: boolean;
}
interface HhcTicket {
  id: string;
  publicId: string;
  type: string;
  zone: string | null;
  isSeasonCard: boolean;
  status: SupportStatus;
  statusReason: string | null;
  validity: string;
  events: { title: string; startsAt: string; cancelled: boolean }[];
  scans: Scan[];
  lastMail: { at: string; status: string } | null;
  canResend: boolean;
  anonymized: boolean;
}
interface FhTicket {
  externalId: string;
  barcode: string | null;
  ticketName: string | null;
  event: { title: string; startsAt: string | null; cancelled: boolean } | null;
  isSeasonCard: boolean;
  status: SupportStatus;
  fullhouseStatus: string;
  place: string | null;
  orderNumber: string | null;
  boughtAt: string | null;
  scans: Scan[];
  syncedAt: string | null;
}
interface Customer<T> {
  key: string;
  name: string | null;
  email: string | null;
  tickets: T[];
}
interface Result {
  kind: Exclude<SupportSearchKind, "auto">;
  personal: boolean;
  canView: boolean;
  hhc: { customers: Customer<HhcTicket>[]; count: number; truncated: boolean };
  fullhouse: { state: "live" | "test" | "local" | "unavailable"; message: string | null; lastSync: string | null; customers: Customer<FhTicket>[]; count: number; truncated: boolean };
}

const STATUS_TONE: Record<SupportStatus, string> = {
  VALID: "bg-success/10 text-success",
  SCANNED: "bg-primary/10 text-hhc-orange-dark",
  REVOKED: "bg-destructive/10 text-destructive",
  CANCELLED_EVENT: "bg-destructive/10 text-destructive",
  EXPIRED: "bg-surface-muted text-muted-foreground",
  RESERVED: "bg-surface-muted text-foreground",
  DETAILS: "bg-surface-muted text-foreground",
  UNKNOWN: "bg-surface-muted text-muted-foreground",
};

const SCAN_RESULT: Record<string, string> = { VALID: "Binnen", WARNING: "Waarschuwing", INVALID: "Geweigerd" };

function StatusBadge({ status }: { status: SupportStatus }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_TONE[status])}>{SUPPORT_STATUS_LABELS[status]}</span>;
}

function ScanList({ scans }: { scans: Scan[] }) {
  if (scans.length === 0) return <p className="text-xs text-muted-foreground">Nog niet gescand bij de HHC-scanners.</p>;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Scanhistorie ({scans.length})</summary>
      <ul className="mt-2 space-y-1 border-l border-border pl-3">
        {scans.map((s, i) => (
          <li key={i}>
            <span className="font-medium">{formatDayTime(s.at)}</span> · {SCAN_RESULT[s.result] ?? s.result}
            {s.reentry && " (herintrede)"}
            {s.overridden && " (handmatig doorgelaten)"}
            {s.event && ` · ${s.event}`}
            {s.where && ` · ${s.where}`}
            {s.reason && <span className="text-muted-foreground"> · {s.reason}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function CustomerCard<T>({ customer, children }: { customer: Customer<T>; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{customer.name || "Naam onbekend"}</span>
          {customer.email && <span className="text-sm text-muted-foreground">{customer.email}</span>}
          <span className="ml-auto text-xs text-muted-foreground">
            {customer.tickets.length} {customer.tickets.length === 1 ? "ticket" : "tickets"}
          </span>
        </div>
        <ul className="divide-y divide-border">{children}</ul>
      </CardContent>
    </Card>
  );
}

function HhcRow({ t, canView, onResend, busy }: { t: HhcTicket; canView: boolean; onResend: (t: HhcTicket) => void; busy: boolean }) {
  return (
    <li className="space-y-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={t.status} />
        <span className="font-medium">{t.type}</span>
        {t.isSeasonCard && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-hhc-orange-dark">Seizoenskaart</span>}
        <span className="font-mono text-xs text-muted-foreground">{t.publicId}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        {t.validity}
        {t.events.length === 1 && ` · ${formatDayTime(t.events[0].startsAt)}`}
        {t.zone && ` · ${t.zone}`}
        {t.statusReason && t.status === "REVOKED" && ` · Reden: ${t.statusReason}`}
      </p>
      {t.events.length > 1 && (
        <p className="text-xs text-muted-foreground">
          {t.events.map((e) => `${e.title} (${formatDay(e.startsAt)}${e.cancelled ? ", afgelast" : ""})`).join(" · ")}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t.lastMail ? `Laatste mail: ${formatDayTime(t.lastMail.at)}${t.lastMail.status === "FAILED" ? " (mislukt)" : ""}` : "Nog geen mail verstuurd."}</p>
      <ScanList scans={t.scans} />
      <div className="flex flex-wrap gap-2 pt-1">
        {canView && (
          <Link href={`/tickets/overzicht/${t.id}`} className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-surface-muted">
            Bekijken
          </Link>
        )}
        {t.canResend && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onResend(t)}>
            {busy ? "Bezig…" : "Opnieuw versturen"}
          </Button>
        )}
      </div>
    </li>
  );
}

function FhRow({ t }: { t: FhTicket }) {
  return (
    <li className="space-y-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={t.status} />
        <span className="font-medium">{t.ticketName || "Ticket"}</span>
        {t.isSeasonCard && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-hhc-orange-dark">Seizoenskaart</span>}
        {t.barcode && <span className="font-mono text-xs text-muted-foreground">{t.barcode}</span>}
      </div>
      <p className="text-sm text-muted-foreground">
        {t.event ? `${t.event.title}${t.event.startsAt ? ` · ${formatDayTime(t.event.startsAt)}` : ""}` : "Wedstrijd (nog) niet in de Hub"}
        {t.place && ` · ${t.place}`}
      </p>
      <p className="text-xs text-muted-foreground">
        {t.orderNumber && <>Ordernummer <span className="font-mono">{t.orderNumber}</span> · </>}
        {t.boughtAt && `Gekocht ${formatDay(t.boughtAt)} · `}
        Fullhouse-status {t.fullhouseStatus}
        {t.syncedAt && ` · in de Hub sinds synchronisatie van ${formatDayTime(t.syncedAt)}`}
      </p>
      <ScanList scans={t.scans} />
    </li>
  );
}

const FH_STATE: Record<Result["fullhouse"]["state"], { label: string; tone: string }> = {
  live: { label: "Live uit Fullhouse", tone: "bg-success/10 text-success" },
  test: { label: "Testgegevens", tone: "bg-surface-muted text-foreground" },
  local: { label: "Eigen kopie", tone: "bg-surface-muted text-foreground" },
  unavailable: { label: "Niet beschikbaar", tone: "bg-destructive/10 text-destructive" },
};

export function SupportSearch({ canResend, canView, personal, testMode }: { canResend: boolean; canView: boolean; personal: boolean; testMode: boolean }) {
  const toast = useStableToast();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<SupportSearchKind>("auto");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      setResult(await api<Result>("/api/klantenservice/zoeken", { body: { q: q.trim(), kind } }));
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend(t: HhcTicket) {
    setSending(t.id);
    try {
      await api(`/api/tickets/tickets/${t.id}/send`, { body: {} });
      toast.success("Ticket opnieuw verstuurd naar het e-mailadres van het ticket.");
      setResult((r) =>
        r && {
          ...r,
          hhc: { ...r.hhc, customers: r.hhc.customers.map((c) => ({ ...c, tickets: c.tickets.map((x) => (x.id === t.id ? { ...x, lastMail: { at: new Date().toISOString(), status: "SENT" } } : x)) })) },
        },
      );
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSending(null);
    }
  }

  const fh = result?.fullhouse;
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl bg-hhc-black p-6 text-hhc-white sm:p-8">
        <h1 className="text-2xl font-bold">Klant of ticket zoeken</h1>
        <p className="mt-1 text-white/70">Zoek tegelijk in het HHC-ticketsysteem en in Fullhouse, op naam, e-mailadres, ticket- of kaartnummer of ordernummer.</p>
        <form onSubmit={(e) => void search(e)} className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Input
            className="flex-1 text-foreground"
            placeholder="Bijvoorbeeld: Jan Jansen, jan@voorbeeld.nl of een ticketnummer"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Zoekterm"
            autoComplete="off"
            spellCheck={false}
            maxLength={120}
          />
          <Select className="text-foreground sm:w-56" value={kind} onChange={(e) => setKind(e.target.value as SupportSearchKind)} aria-label="Zoeken op">
            {Object.entries(SUPPORT_KIND_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {k === "auto" ? "Zoeken op: automatisch" : v}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={busy || !q.trim()}>
            <Search className="mr-1.5 h-4 w-4" />
            {busy ? "Zoeken…" : "Zoeken"}
          </Button>
        </form>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-white/60">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Zoek alleen als een klant erom vraagt. Elke zoekopdracht wordt vastgelegd in het auditlog.{!personal && " E-mailadressen zie je gedeeltelijk."}
        </p>
      </section>

      {testMode && (
        <p className="rounded-md border border-border bg-surface-muted p-3 text-sm">
          Op deze omgeving is Fullhouse niet echt gekoppeld: de Fullhouse-resultaten zijn testgegevens (probeer <span className="font-mono">Testbezoeker 3</span>, <span className="font-mono">testbezoeker3@voorbeeld.nl</span>, <span className="font-mono">FH-TEST-0003</span> of <span className="font-mono">mock-order-2</span>).
        </p>
      )}

      {result && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">HHC-ticketsysteem</h2>
              <span className="text-sm text-muted-foreground">
                {result.hhc.count} {result.hhc.count === 1 ? "ticket" : "tickets"}
              </span>
              <span className="ml-auto rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">Actueel</span>
            </div>
            {result.hhc.truncated && <p className="text-xs text-muted-foreground">Alleen de eerste 50 tickets worden getoond. Maak de zoekterm specifieker.</p>}
            {result.hhc.customers.length === 0 && <p className="text-sm text-muted-foreground">Niets gevonden in het HHC-ticketsysteem.</p>}
            {result.hhc.customers.map((c) => (
              <CustomerCard key={c.key} customer={c}>
                {c.tickets.map((t) => (
                  <HhcRow key={t.id} t={t} canView={canView && result.canView} onResend={canResend ? (x) => void resend(x) : () => {}} busy={sending === t.id} />
                ))}
              </CustomerCard>
            ))}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Fullhouse</h2>
              <span className="text-sm text-muted-foreground">
                {fh!.count} {fh!.count === 1 ? "ticket" : "tickets"}
              </span>
              <span className={cn("ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium", FH_STATE[fh!.state].tone)}>{FH_STATE[fh!.state].label}</span>
            </div>
            {fh!.message && <p className="rounded-md border border-border bg-surface-muted p-3 text-sm">{fh!.message}</p>}
            {fh!.truncated && <p className="text-xs text-muted-foreground">Fullhouse geeft maximaal 50 tickets per zoekopdracht. Maak de zoekterm specifieker.</p>}
            {fh!.state !== "unavailable" && fh!.customers.length === 0 && <p className="text-sm text-muted-foreground">Niets gevonden in Fullhouse.</p>}
            {fh!.customers.map((c) => (
              <CustomerCard key={c.key} customer={c}>
                {c.tickets.map((t) => (
                  <FhRow key={t.externalId} t={t} />
                ))}
              </CustomerCard>
            ))}
            <p className="text-xs text-muted-foreground">
              Status en kopergegevens komen live uit Fullhouse (alleen lezen); scans komen van de HHC-scanners.
              {fh!.lastSync && ` Laatste synchronisatie van Fullhouse-tickets: ${formatDayTime(fh!.lastSync)}.`} Opnieuw versturen of wijzigen van een Fullhouse-ticket doe je in{" "}
              <a href="https://dashboard.fullhouse.tech/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-hhc-orange-dark hover:underline">
                Fullhouse <ExternalLink className="h-3 w-3" />
              </a>
              .
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
