"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { formatDayTime } from "@/lib/date-format";

interface Run {
  id: string;
  trigger: "SCHEDULED" | "MANUAL";
  status: "RUNNING" | "OK" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  triggeredByName: string | null;
  target: string | null;
  bytes: number | null;
  tableCount: number | null;
  rowCount: number | null;
  keyId: string | null;
  filesCopied: number | null;
  filesPending: number | null;
  error: string | null;
  downloadable: boolean;
  pruned: boolean;
}

interface Overview {
  config: { target: "s3" | "blob" | null; targetLabel: string | null; encryption: boolean; keyId: string | null; mirrorsFiles: boolean; problems: string[] };
  lastOkAt: string | null;
  stale: boolean;
  runs: Run[];
}

function size(bytes: number | null): string {
  if (bytes == null) return "–";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

async function fetchOverview(): Promise<{ data?: Overview; error?: string }> {
  const res = await fetch("/api/admin/backups", { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: typeof body.error === "string" ? body.error : "Kon de back-ups niet laden." };
  return { data: body as Overview };
}

export function BackupsPanel() {
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((r: { data?: Overview; error?: string }) => {
    setError(r.error ?? null);
    if (r.data) setData(r.data);
  }, []);
  const load = useCallback(() => fetchOverview().then(apply), [apply]);

  useEffect(() => {
    let alive = true;
    fetchOverview().then((r) => alive && apply(r));
    return () => {
      alive = false;
    };
  }, [apply]);

  async function backupNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/backups", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) toast.success("Back-up gemaakt.");
      else toast.error(typeof body.error === "string" ? body.error : "Back-up mislukt.");
    } finally {
      setBusy(false);
      load();
    }
  }

  const config = data?.config;
  const ready = !!config && config.problems.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Back-ups</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Elke nacht (rond 03:00) wordt een volledige kopie van alle gegevens gemaakt, versleuteld en buiten de database bewaard.
            Bewaard worden: alles van de laatste 14 dagen, één per week voor 8 weken en één per maand voor 12 maanden.
          </p>
        </div>
        <Button onClick={backupNow} disabled={!ready || busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {busy ? "Bezig…" : "Nu een back-up maken"}
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {config ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {data.stale ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
                Laatste geslaagde back-up
              </CardTitle>
              <CardDescription>
                {data.lastOkAt ? formatDayTime(data.lastOkAt) : "Nog geen"}
                {data.stale ? " · ouder dan anderhalve dag, kijk hieronder wat er misgaat." : ""}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" /> Versleuteling
              </CardTitle>
              <CardDescription>
                {config.encryption ? `AES-256, sleutel ${config.keyId}. Bewaar de sleutel ook in jullie wachtwoordkluis.` : "Niet ingesteld."}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Opslag</CardTitle>
              <CardDescription>
                {config.targetLabel ?? "Niet ingesteld."}
                {config.target === "blob" ? " Stel een aparte opslag buiten Vercel in voor een echte externe kopie." : ""}
                {config.mirrorsFiles ? " Ook alle geüploade bestanden worden gekopieerd." : ""}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      {config && config.problems.length ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm">
            <p className="font-semibold">Back-ups staan nog niet aan</p>
            <ul className="mt-2 list-disc pl-5 text-muted-foreground">
              {config.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historie</CardTitle>
          <CardDescription>Een download is versleuteld; alleen met de back-upsleutel is hij terug te zetten (zie de herstelprocedure).</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!data ? (
            <p className="text-sm text-muted-foreground">Laden…</p>
          ) : data.runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen back-ups.</p>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Moment</th>
                  <th className="py-2 pr-3 font-medium">Soort</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Inhoud</th>
                  <th className="py-2 pr-3 font-medium">Grootte</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDayTime(r.startedAt)}</td>
                    <td className="py-2 pr-3">{r.trigger === "MANUAL" ? `Handmatig${r.triggeredByName ? ` (${r.triggeredByName})` : ""}` : "Automatisch"}</td>
                    <td className="py-2 pr-3">
                      {r.status === "OK" ? (
                        <Badge variant="success">{r.pruned ? "Opgeruimd" : "Gelukt"}</Badge>
                      ) : r.status === "FAILED" ? (
                        <span className="text-destructive" title={r.error ?? undefined}>
                          Mislukt{r.error ? `: ${r.error.slice(0, 120)}` : ""}
                        </span>
                      ) : (
                        <Badge>Bezig</Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {r.rowCount != null ? `${r.rowCount.toLocaleString("nl-NL")} rijen uit ${r.tableCount} tabellen` : "–"}
                      {r.filesCopied ? ` · ${r.filesCopied} bestanden gekopieerd` : ""}
                      {r.filesPending ? ` · ${r.filesPending} volgen nog` : ""}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{size(r.bytes)}</td>
                    <td className="py-2 text-right">
                      {r.downloadable ? (
                        <a href={`/api/admin/backups/${r.id}/download`} className="inline-flex items-center gap-1 text-hhc-orange-dark hover:underline">
                          <Download className="h-4 w-4" /> Download
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
