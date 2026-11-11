"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { formatDayTime } from "@/lib/date-format";
import { api, errorText, PageTitle } from "@/components/tickets/parts";

interface Batch {
  id: string;
  name: string;
  origin: string;
  status: "PENDING_APPROVAL" | "ISSUED" | "REJECTED";
  rowCount: number;
  issuedCount: number;
  requestedById: string | null;
  requestedBy: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

const LABEL = { PENDING_APPROVAL: "Wacht op goedkeuring", ISSUED: "Uitgegeven", REJECTED: "Afgewezen" } as const;
const ORIGIN: Record<string, string> = { CSV: "CSV", XLSX: "Excel", MANUAL: "Handmatig", LIST: "Vaste lijst", COMMERCIAL: "Commerciële Zaken" };

export function Approvals({ userId }: { userId: string }) {
  const toast = useStableToast();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBatches((await api<{ batches: Batch[] }>("/api/tickets/batches")).batches);
    } catch (e) {
      toast.error(errorText(e));
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, decision: "approve" | "reject") {
    setBusy(id);
    try {
      const r = await api<{ status: string; count?: number }>(`/api/tickets/batches/${id}/review`, { body: { decision, note: notes[id] || null } });
      toast.success(decision === "approve" ? `${r.count} tickets uitgegeven.` : "Aanvraag afgewezen.");
      await load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const pending = batches.filter((b) => b.status === "PENDING_APPROVAL");
  const done = batches.filter((b) => b.status !== "PENDING_APPROVAL");
  return (
    <div className="space-y-6">
      <PageTitle title="Goedkeuringen" description="Bulkuitgiftes boven de drempel. Een aanvraag keurt altijd iemand anders goed dan de aanvrager." />
      <Card>
        <CardContent className="p-0">
          {pending.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Er wacht niets op goedkeuring.</p>
          ) : (
            <ul className="divide-y divide-border">
              {pending.map((b) => {
                const own = b.requestedById === userId;
                return (
                  <li key={b.id} className="space-y-3 p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.rowCount} tickets · {ORIGIN[b.origin] ?? b.origin} · aangevraagd door {b.requestedBy ?? "onbekend"} op {formatDayTime(b.createdAt)}
                        </p>
                      </div>
                      <Badge variant="primary">{LABEL[b.status]}</Badge>
                    </div>
                    {own ? (
                      <p className="text-xs text-muted-foreground">Dit is je eigen aanvraag; een andere collega moet hem beoordelen.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Input className="min-w-48 flex-1" placeholder="Toelichting (optioneel)" value={notes[b.id] ?? ""} onChange={(e) => setNotes({ ...notes, [b.id]: e.target.value })} aria-label="Toelichting" />
                        <Button disabled={busy === b.id} onClick={() => review(b.id, "approve")}>
                          Goedkeuren en uitgeven
                        </Button>
                        <Button variant="outline" disabled={busy === b.id} onClick={() => review(b.id, "reject")}>
                          Afwijzen
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {done.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Eerdere uitgiftes</h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border text-sm">
                {done.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                    <div>
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.status === "ISSUED" ? `${b.issuedCount} tickets` : `${b.rowCount} regels`} · {ORIGIN[b.origin] ?? b.origin} · {b.requestedBy ?? "onbekend"} · {formatDayTime(b.createdAt)}
                        {b.reviewedBy ? ` · beoordeeld door ${b.reviewedBy}` : ""}
                        {b.reviewNote ? ` · ${b.reviewNote}` : ""}
                      </p>
                    </div>
                    <Badge variant={b.status === "ISSUED" ? "success" : "outline"}>{LABEL[b.status]}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
