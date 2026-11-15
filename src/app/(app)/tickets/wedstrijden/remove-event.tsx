"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, errorText } from "@/components/tickets/parts";

interface Usage {
  title: string;
  source: string;
  tickets: number;
  activeTickets: number;
  scans: number;
  deliveries: number;
  promos: number;
  external: number;
  canDelete: boolean;
  canArchive: boolean;
  reason: string | null;
  archiveBlocked: string | null;
}

/**
 * Wedstrijd verwijderen of archiveren. Eerst ziet de beheerder wat eraan hangt; verwijderen kan
 * alleen zonder tickets, scans of verzonden mails. Ter bevestiging typ je de titel over.
 */
export function RemoveEvent({ event, onDone, onClose }: { event: { id: string; title: string }; onDone: () => void; onClose: () => void }) {
  const toast = useStableToast();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api<Usage>(`/api/tickets/events/${event.id}/remove`).then(
      (u) => live && setUsage(u),
      (e) => {
        if (!live) return;
        toast.error(errorText(e));
        onClose();
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  async function go(mode: "delete" | "archive") {
    setBusy(true);
    try {
      await api(`/api/tickets/events/${event.id}/remove`, { body: { mode, confirmTitle: confirm, reason: reason || null } });
      toast.success(mode === "delete" ? "Wedstrijd verwijderd." : "Wedstrijd gearchiveerd. Je vindt hem terug via 'Gearchiveerde wedstrijden tonen'.");
      onClose();
      onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const matches = confirm.trim().toLowerCase() === event.title.trim().toLowerCase();
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
      {!usage ? (
        <p className="text-muted-foreground">Controleren wat er aan deze wedstrijd hangt…</p>
      ) : (
        <div className="space-y-3">
          <p className="font-medium">{usage.canDelete ? "Wedstrijd verwijderen" : "Wedstrijd archiveren"}</p>
          <p className="text-xs text-muted-foreground">
            {usage.tickets} HHC-tickets ({usage.activeTickets} geldig) · {usage.scans} scans · {usage.deliveries} verzonden mails
            {usage.promos ? ` · in ${usage.promos} actiecode(s)` : ""}
            {usage.source === "FULLHOUSE" ? ` · ${usage.external} Fullhouse-tickets in de controlekopie` : ""}
          </p>
          {usage.canDelete ? (
            <p>Er hangt niets aan deze wedstrijd. Verwijderen is definitief.{usage.promos ? " De wedstrijd gaat ook uit de actiecodes." : ""}</p>
          ) : (
            <p>
              {usage.reason} Een gearchiveerde wedstrijd verdwijnt uit de lijsten, de scanner, het dashboard en de Fullhouse-synchronisatie. Tickets, scans en rapportages blijven bewaard en je kunt hem altijd terugzetten.
            </p>
          )}
          {!usage.canDelete && usage.archiveBlocked && <p className="font-medium text-destructive">{usage.archiveBlocked}</p>}
          {(usage.canDelete || usage.canArchive) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={`rm-${event.id}`}>Typ ter bevestiging de titel: {event.title}</Label>
                <Input id={`rm-${event.id}`} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor={`rr-${event.id}`}>Reden (optioneel, komt in de auditlog)</Label>
                <Input id={`rr-${event.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {usage.canDelete && (
              <Button size="sm" variant="destructive" disabled={busy || !matches} onClick={() => go("delete")}>
                Definitief verwijderen
              </Button>
            )}
            {usage.canArchive && (
              <Button size="sm" variant={usage.canDelete ? "outline" : "destructive"} disabled={busy || !matches} onClick={() => go("archive")}>
                Archiveren
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onClose}>
              Annuleren
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
