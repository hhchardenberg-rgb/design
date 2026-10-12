"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api } from "@/lib/commercial/client";
import { parseCsv } from "@/lib/commercial/csv";

const FIELDS: Record<string, string> = {
  name: "Bedrijfsnaam", tradeName: "Handelsnaam", status: "Status (prospect, actief, voormalig)", street: "Straat en huisnummer", postalCode: "Postcode",
  city: "Plaats", website: "Website", email: "E-mailadres", phone: "Telefoon", kvkNumber: "KvK-nummer", industry: "Branche",
  sponsorCategory: "Sponsorcategorie", source: "Bron", tags: "Tags (gescheiden door |)", internalNotes: "Interne notitie",
};
// Herkent gangbare kolomkoppen automatisch; de gebruiker kan altijd corrigeren.
const GUESS: [RegExp, string][] = [
  [/^(bedrijfs)?naam|company|bedrijf$/i, "name"], [/handels/i, "tradeName"], [/status/i, "status"], [/straat|adres|street/i, "street"], [/postcode|zip/i, "postalCode"],
  [/plaats|stad|city/i, "city"], [/web/i, "website"], [/mail/i, "email"], [/tel|phone/i, "phone"], [/kvk/i, "kvkNumber"], [/branche|industry/i, "industry"],
  [/categorie|category/i, "sponsorCategory"], [/bron|source/i, "source"], [/tag/i, "tags"], [/notitie|opmerking|notes/i, "internalNotes"],
];

interface Result { row: number; outcome: "ok" | "duplicate" | "invalid"; name: string; message?: string }
interface Summary { dryRun: boolean; created: number; wouldCreate: number; duplicates: number; invalid: number; results: Result[] }

export function ImportWizard() {
  const toast = useStableToast();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setSummary(null);
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) {
      toast.error("Het bestand heeft geen gegevensrijen. Gebruik een CSV met een kopregel.");
      return;
    }
    setRows(parsed);
    const guess: Record<number, string> = {};
    const used = new Set<string>();
    parsed[0].forEach((h, i) => {
      const hit = GUESS.find(([re]) => re.test(h.trim()))?.[1];
      if (hit && !used.has(hit)) {
        guess[i] = hit;
        used.add(hit);
      }
    });
    setMapping(guess);
  }

  const payload = useMemo(() => {
    if (!rows) return [];
    return rows.slice(1).map((r) => {
      const o: Record<string, string> = {};
      for (const [i, f] of Object.entries(mapping)) if (f) o[f] = r[Number(i)] ?? "";
      return o;
    });
  }, [rows, mapping]);
  const hasName = Object.values(mapping).includes("name");

  async function run(dryRun: boolean) {
    setBusy(true);
    const r = await api<Summary>("/api/commercial/companies/import", "POST", { dryRun, rows: payload });
    setBusy(false);
    if (r.ok) {
      setSummary(r.data);
      if (!dryRun) toast.success(`${r.data.created} sponsor(s) geïmporteerd.`);
    } else toast.error(r.error);
  }

  return (
    <div className="space-y-5">
      <Link href="/commercieel/sponsoren" className="inline-flex items-center gap-1 text-sm text-hhc-orange-dark"><ArrowLeft className="h-4 w-4" /> Alle sponsoren</Link>
      <div>
        <h1 className="text-2xl font-bold">Sponsoren importeren</h1>
        <p className="text-sm text-muted-foreground">Kies een CSV-bestand (Excel: opslaan als CSV). Je koppelt de kolommen, controleert eerst een proefrun en importeert daarna. Bestaande dossiers worden nooit overschreven; dubbelen worden overgeslagen. Maximaal 500 rijen per keer.</p>
      </div>
      <Card>
        <CardContent className="pt-5">
          <Label htmlFor="csv">CSV-bestand</Label>
          <input id="csv" type="file" accept=".csv,text/csv" className="mt-1 block text-sm" onChange={(e) => void onFile(e.target.files?.[0])} />
        </CardContent>
      </Card>
      {rows && (
        <Card>
          <CardHeader><CardTitle>Kolommen koppelen</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {rows[0].map((h, i) => (
                <div key={i}>
                  <Label htmlFor={`col-${i}`}>Kolom “{h || `kolom ${i + 1}`}” <span className="text-xs text-muted-foreground">(bv. {rows[1][i] || "leeg"})</span></Label>
                  <select id={`col-${i}`} className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-2 text-sm" value={mapping[i] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value }))}>
                    <option value="">Niet importeren</option>
                    {Object.entries(FIELDS).map(([k, v]) => <option key={k} value={k} disabled={Object.entries(mapping).some(([j, f]) => f === k && Number(j) !== i)}>{v}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {!hasName && <p role="alert" className="text-sm text-destructive">Koppel minstens één kolom aan “Bedrijfsnaam”.</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!hasName || busy} onClick={() => run(true)}>{busy ? "Bezig…" : `Proefrun (${payload.length} rijen)`}</Button>
              <Button disabled={!hasName || busy || !summary?.dryRun || summary.wouldCreate === 0} onClick={() => run(false)}>Nu importeren ({summary?.dryRun ? summary.wouldCreate : 0})</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {summary && (
        <Card>
          <CardHeader><CardTitle>{summary.dryRun ? "Resultaat proefrun (er is niets opgeslagen)" : "Import voltooid"}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>{summary.dryRun ? `${summary.wouldCreate} nieuw` : `${summary.created} aangemaakt`} · {summary.duplicates} dubbel (overgeslagen) · {summary.invalid} met fout</p>
            {summary.dryRun === false && <Link className="underline text-hhc-orange-dark" href="/commercieel/sponsoren">Naar de sponsorenlijst</Link>}
            <ul className="max-h-80 divide-y divide-border overflow-auto rounded border border-border">
              {summary.results.filter((r) => r.outcome !== "ok").map((r) => (
                <li key={r.row} className="flex flex-wrap items-center gap-2 p-2">
                  <Badge variant="outline">Rij {r.row}</Badge> <span className="font-medium">{r.name || "(zonder naam)"}</span> <span className="text-muted-foreground">{r.message}</span>
                </li>
              ))}
              {summary.results.every((r) => r.outcome === "ok") && <li className="p-2 text-muted-foreground">Geen problemen gevonden.</li>}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
