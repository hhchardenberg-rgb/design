"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { formatDay, formatDayTime } from "@/lib/date-format";
import { TICKET_CATEGORIES, TICKET_STATUS_LABELS, VALIDITY_MODES, type TicketCategory, type TicketStatus, type ValidityMode } from "@/lib/tickets/rules";
import { api, errorText, TicketStatusBadge } from "@/components/tickets/parts";

interface Detail {
  id: string;
  publicId: string;
  displayName: string;
  canSeePersonal: boolean;
  email: string | null;
  phone: string | null;
  company: string | null;
  relation: string | null;
  note: string | null;
  category: TicketCategory;
  type: string;
  zone: string | null;
  season: string | null;
  batch: { id: string; name: string } | null;
  storedStatus: TicketStatus;
  status: TicketStatus | "EXPIRED";
  statusReason: string | null;
  validityMode: ValidityMode;
  competitions: string[];
  homeOnly: boolean;
  isSeasonCard: boolean;
  validFrom: string | null;
  validUntil: string | null;
  qrVersion: number;
  linkVersion: number;
  events: { id: string; title: string; startsAt: string; status: string }[];
  issuedBy: string | null;
  createdAt: string;
  anonymizedAt: string | null;
  history: { id: string; at: string; action: string; summary: string; actor: string | null; oldStatus: string | null; newStatus: string | null; reason: string | null }[];
}

type Action = { kind: "status"; to: TicketStatus; label: string } | { kind: "reissue"; what: "qr" | "link"; label: string } | { kind: "anonymize"; label: string };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2 break-words">{children}</dd>
    </div>
  );
}

export function TicketDetail({ id, canBlock, canResend, canAnonymize }: { id: string; canBlock: boolean; canResend: boolean; canAnonymize: boolean }) {
  const toast = useStableToast();
  const [t, setT] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setT(await api<Detail>(`/api/tickets/tickets/${id}`));
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function confirm() {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === "status") await api(`/api/tickets/tickets/${id}/status`, { body: { status: action.to, reason } });
      else if (action.kind === "reissue") await api(`/api/tickets/tickets/${id}/reissue`, { body: { what: action.what, reason } });
      else await api(`/api/tickets/tickets/${id}/anonymize`, { body: { reason } });
      toast.success("Opgeslagen en vastgelegd in het auditlog.");
      setAction(null);
      setReason("");
      await load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!t) return <p className="text-sm text-muted-foreground">Laden…</p>;

  const actions: Action[] = [];
  if (canBlock && !t.anonymizedAt) {
    if (t.storedStatus === "ACTIVE") actions.push({ kind: "status", to: "BLOCKED", label: "Blokkeren" }, { kind: "status", to: "CANCELLED", label: "Annuleren" });
    if (t.storedStatus === "BLOCKED") actions.push({ kind: "status", to: "ACTIVE", label: "Deblokkeren" }, { kind: "status", to: "CANCELLED", label: "Annuleren" });
    if (t.storedStatus === "CANCELLED" && t.status !== "EXPIRED") actions.push({ kind: "status", to: "ACTIVE", label: "Opnieuw activeren" });
  }
  if (canResend && !t.anonymizedAt) actions.push({ kind: "reissue", what: "qr", label: "Nieuwe QR-code (oude ongeldig)" }, { kind: "reissue", what: "link", label: "Ticketlink intrekken" });
  if (canAnonymize && !t.anonymizedAt) actions.push({ kind: "anonymize", label: "Persoonsgegevens anonimiseren" });

  return (
    <div className="space-y-6">
      <Link href="/tickets/overzicht" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Ticketoverzicht
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t.displayName}</h1>
          <p className="font-mono text-xs text-muted-foreground">{t.publicId}</p>
        </div>
        <TicketStatusBadge status={t.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ticket</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <Row label="Tickettype">{t.type}</Row>
              <Row label="Categorie">{TICKET_CATEGORIES[t.category]}</Row>
              <Row label="Toegangsvak">{t.zone ?? "Alle vakken"}</Row>
              <Row label="Geldig voor">
                {VALIDITY_MODES[t.validityMode]}
                {t.isSeasonCard ? " (seizoenskaart)" : ""}
              </Row>
              {t.season && <Row label="Seizoen">{t.season}</Row>}
              {t.validityMode === "SEASON" && (
                <Row label="Bereik">
                  {t.homeOnly ? "Thuiswedstrijden" : "Alle wedstrijden"}
                  {t.competitions.length ? ` · ${t.competitions.join(", ")}` : ""}
                </Row>
              )}
              {t.events.length > 0 && (
                <Row label={t.events.length === 1 ? "Wedstrijd" : "Wedstrijden"}>
                  <ul>
                    {t.events.map((e) => (
                      <li key={e.id}>
                        {e.title} · {formatDayTime(e.startsAt)}
                      </li>
                    ))}
                  </ul>
                </Row>
              )}
              {t.validFrom && <Row label="Geldig vanaf">{formatDay(t.validFrom)}</Row>}
              <Row label="Vervaldatum">{t.validUntil ? formatDayTime(t.validUntil) : "–"}</Row>
              <Row label="Status">
                {TICKET_STATUS_LABELS[t.status]}
                {t.statusReason ? ` · ${t.statusReason}` : ""}
              </Row>
              <Row label="Bron">HHC (intern)</Row>
              <Row label="Uitgegeven">
                {formatDayTime(t.createdAt)} door {t.issuedBy ?? "onbekend"}
                {t.batch ? ` · ${t.batch.name}` : ""}
              </Row>
              <Row label="Versie QR / link">
                {t.qrVersion} / {t.linkVersion}
              </Row>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tickethouder</CardTitle>
          </CardHeader>
          <CardContent>
            {t.anonymizedAt ? (
              <p className="text-sm text-muted-foreground">De persoonsgegevens zijn op {formatDay(t.anonymizedAt)} geanonimiseerd.</p>
            ) : !t.canSeePersonal ? (
              <p className="text-sm text-muted-foreground">Je hebt geen recht om contactgegevens van tickethouders te zien.</p>
            ) : (
              <dl className="divide-y divide-border">
                <Row label="E-mailadres">{t.email ?? "–"}</Row>
                <Row label="Telefoon">{t.phone ?? "–"}</Row>
                <Row label="Bedrijf">{t.company ?? "–"}</Row>
                <Row label="Relatie of sponsor">{t.relation ?? "–"}</Row>
                <Row label="Opmerking">{t.note ?? "–"}</Row>
              </dl>
            )}
            <p className="mt-4 text-xs text-muted-foreground">Ticketmail, persoonlijke ticketpagina, QR-code, PDF en wallet volgen in fase 2.</p>
          </CardContent>
        </Card>
      </div>

      {actions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Acties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <Button key={a.label} size="sm" variant={a.kind === "status" && a.to !== "ACTIVE" ? "destructive" : "outline"} onClick={() => (setAction(a), setReason(""))}>
                  {a.label}
                </Button>
              ))}
            </div>
            {action && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <Label htmlFor="act-reason">Reden voor “{action.label.toLowerCase()}” (verplicht, komt in het auditlog)</Label>
                <Textarea id="act-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={confirm} disabled={busy || reason.trim().length < 3}>
                    Bevestigen
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAction(null)}>
                    Annuleren
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historie</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {t.history.map((h) => (
              <li key={h.id} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground tabular-nums">{formatDayTime(h.at)}</span>
                <span>{h.summary}</span>
                {h.actor && <span className="text-muted-foreground">· {h.actor}</span>}
                {h.reason && <span className="text-muted-foreground">· {h.reason}</span>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
