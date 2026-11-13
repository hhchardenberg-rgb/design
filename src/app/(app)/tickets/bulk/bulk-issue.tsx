"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { errorText, PageTitle, api } from "@/components/tickets/parts";
import { EMPTY_SETTINGS, IssueSettings, issueBody, type IssueSettingsValue } from "@/components/tickets/issue-settings";

interface Holder {
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
}
interface Parsed {
  holders: Holder[];
  errors: { row: number; message: string }[];
  unknownColumns: string[];
  duplicates: number;
  origin: "CSV" | "XLSX";
  threshold: number;
}
type Result = { pendingApproval: boolean; count: number };

export function BulkIssue() {
  const toast = useStableToast();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileName, setFileName] = useState("");
  const [settings, setSettings] = useState<IssueSettingsValue>(EMPTY_SETTINGS);
  const [batchName, setBatchName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/tickets/bulk/parse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Het bestand kon niet worden gelezen.");
      setParsed(data);
      setFileName(file.name);
      if (!batchName) setBatchName(file.name.replace(/\.(csv|xlsx|txt)$/i, ""));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!parsed) return;
    setBusy(true);
    try {
      const r = await api<Result>(`/api/tickets/tickets?bron=${parsed.origin}`, { body: issueBody(settings, parsed.holders, batchName) });
      setResult(r);
      setParsed(null);
      toast.success(r.pendingApproval ? "Aanvraag ingediend; wacht op goedkeuring." : `${r.count} tickets uitgegeven.`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const blocking = parsed ? parsed.errors.length > 0 : true;
  return (
    <div className="space-y-6">
      <PageTitle title="Bulkuitgifte" description="Upload een lijst met tickethouders (CSV of Excel) en geef in één keer tickets uit. Grote aantallen gaan eerst langs een tweede persoon ter goedkeuring.">
        <a href="/api/tickets/bulk/template" className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-muted">
          <Download className="h-4 w-4" /> CSV-sjabloon
        </a>
      </PageTitle>

      {result && (
        <Card className="border-success/40">
          <CardContent className="p-4 text-sm">
            {result.pendingApproval ? (
              <>
                De aanvraag voor {result.count} tickets staat klaar. Een andere collega met goedkeuringsrecht keurt hem goed onder{" "}
                <Link href="/tickets/goedkeuringen" className="font-semibold text-hhc-orange-dark hover:underline">
                  Goedkeuringen
                </Link>
                .
              </>
            ) : (
              <>
                {result.count} tickets zijn uitgegeven.{" "}
                <Link href="/tickets/overzicht" className="font-semibold text-hhc-orange-dark hover:underline">
                  Naar het overzicht
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Lijst uploaden</CardTitle>
          <CardDescription>
            Kolommen: Voornaam en Achternaam (verplicht), E-mailadres, Telefoon, Bedrijf, Relatie, Opmerking. Tickettype en wedstrijden kies je hieronder voor de hele lijst.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-border p-6 text-sm hover:bg-surface-muted">
            <Upload className="h-4 w-4" />
            <span>{fileName ? `Ander bestand kiezen (nu: ${fileName})` : "Kies een .csv- of .xlsx-bestand"}</span>
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
          </label>

          {parsed && (
            <div className="space-y-3 text-sm">
              <p>
                <strong>{parsed.holders.length}</strong> geldige regels
                {parsed.duplicates > 0 ? `, waarvan ${parsed.duplicates} dubbel (zelfde naam en e-mail)` : ""}.
                {parsed.holders.length > parsed.threshold ? ` Meer dan ${parsed.threshold}: na het indienen is goedkeuring nodig.` : ""}
              </p>
              {parsed.unknownColumns.length > 0 && <p className="text-muted-foreground">Genegeerde kolommen: {parsed.unknownColumns.join(", ")}.</p>}
              {parsed.errors.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <p className="font-semibold text-destructive">Los eerst deze fouten op in het bestand en upload opnieuw:</p>
                  <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5">
                    {parsed.errors.slice(0, 50).map((e, i) => (
                      <li key={i}>
                        Regel {e.row}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {parsed.holders.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-muted">
                      <tr>
                        <th className="p-2">Naam</th>
                        <th className="p-2">E-mailadres</th>
                        <th className="p-2">Bedrijf</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.holders.slice(0, 10).map((h, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2">
                            {h.firstName} {h.lastName}
                          </td>
                          <td className="p-2">{h.email ?? "–"}</td>
                          <td className="p-2">{h.company ?? "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.holders.length > 10 && <p className="p-2 text-xs text-muted-foreground">En nog {parsed.holders.length - 10} regels.</p>}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {parsed && !blocking && (
        <>
          <IssueSettings value={settings} onChange={setSettings} />
          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 p-4">
              <div className="min-w-60 flex-1">
                <Label htmlFor="bk-name">Naam van deze uitgifte</Label>
                <Input id="bk-name" value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="bv. Sponsoravond november" />
              </div>
              <Button onClick={submit} disabled={busy || !settings.typeId}>
                {parsed.holders.length > parsed.threshold ? `Aanvraag voor ${parsed.holders.length} tickets indienen` : `${parsed.holders.length} tickets uitgeven`}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
