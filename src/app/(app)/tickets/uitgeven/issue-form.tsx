"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, errorText, PageTitle } from "@/components/tickets/parts";
import { EMPTY_SETTINGS, IssueSettings, issueBody, type IssueSettingsValue } from "@/components/tickets/issue-settings";

interface Holder {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  relation: string;
  note: string;
}
const EMPTY: Holder = { firstName: "", lastName: "", email: "", phone: "", company: "", relation: "", note: "" };

type Result = { pendingApproval: false; ticketIds: string[]; count: number } | { pendingApproval: true; batchId: string; count: number; threshold: number };

export function IssueForm({ canMultiple, initialTypeId }: { canMultiple: boolean; initialTypeId?: string }) {
  const toast = useStableToast();
  const [settings, setSettings] = useState<IssueSettingsValue>(EMPTY_SETTINGS);
  const [holders, setHolders] = useState<Holder[]>([{ ...EMPTY }]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const set = (i: number, patch: Partial<Holder>) => setHolders((hs) => hs.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const ready = settings.typeId && holders.every((h) => h.firstName.trim() && h.lastName.trim());

  async function submit() {
    setBusy(true);
    try {
      const r = await api<Result>("/api/tickets/tickets", { body: issueBody(settings, holders) });
      setResult(r);
      if (r.pendingApproval) toast.success(`Aanvraag voor ${r.count} tickets ingediend; wacht op goedkeuring.`);
      else toast.success(r.count === 1 ? "Ticket uitgegeven." : `${r.count} tickets uitgegeven.`);
      setHolders([{ ...EMPTY }]);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle title="Tickets uitgeven" description="Geef een of meer interne HHC-tickets uit. Tickets zijn persoonsgebonden en niet overdraagbaar." />

      {result && (
        <Card className="border-success/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            {result.pendingApproval ? (
              <span>
                Dit zijn meer dan {result.threshold} tickets. De aanvraag staat klaar voor goedkeuring door een andere bevoegde collega.
              </span>
            ) : (
              <span>
                {result.count === 1 ? "Het ticket is uitgegeven." : `${result.count} tickets zijn uitgegeven.`} Versturen per e-mail en de ticketpagina met QR-code volgen in fase 2.
              </span>
            )}
            {!result.pendingApproval && result.count === 1 && (
              <Link className="font-semibold text-hhc-orange-dark hover:underline" href={`/tickets/overzicht/${result.ticketIds[0]}`}>
                Ticket bekijken
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      <IssueSettings value={settings} onChange={setSettings} initialTypeId={initialTypeId} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">{holders.length === 1 ? "Tickethouder" : `Tickethouders (${holders.length})`}</CardTitle>
          {canMultiple && (
            <Button size="sm" variant="outline" onClick={() => setHolders((hs) => [...hs, { ...EMPTY }])}>
              <Plus className="h-4 w-4" /> Persoon toevoegen
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {holders.map((h, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-2">
              {holders.length > 1 && (
                <div className="flex items-center justify-between sm:col-span-2">
                  <p className="text-sm font-semibold">Persoon {i + 1}</p>
                  <Button size="sm" variant="ghost" aria-label={`Persoon ${i + 1} verwijderen`} onClick={() => setHolders((hs) => hs.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div>
                <Label htmlFor={`h-fn-${i}`}>Voornaam</Label>
                <Input id={`h-fn-${i}`} value={h.firstName} onChange={(e) => set(i, { firstName: e.target.value })} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor={`h-ln-${i}`}>Achternaam</Label>
                <Input id={`h-ln-${i}`} value={h.lastName} onChange={(e) => set(i, { lastName: e.target.value })} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor={`h-em-${i}`}>E-mailadres</Label>
                <Input id={`h-em-${i}`} type="email" value={h.email} onChange={(e) => set(i, { email: e.target.value })} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor={`h-ph-${i}`}>Telefoonnummer</Label>
                <Input id={`h-ph-${i}`} type="tel" value={h.phone} onChange={(e) => set(i, { phone: e.target.value })} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor={`h-co-${i}`}>Bedrijfsnaam</Label>
                <Input id={`h-co-${i}`} value={h.company} onChange={(e) => set(i, { company: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`h-re-${i}`}>Relatie of sponsor</Label>
                <Input id={`h-re-${i}`} value={h.relation} onChange={(e) => set(i, { relation: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={`h-no-${i}`}>Opmerking</Label>
                <Textarea id={`h-no-${i}`} value={h.note} onChange={(e) => set(i, { note: e.target.value })} className="min-h-12" />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Een pasfoto toevoegen kan vanaf fase 2, samen met de ticketpagina.</p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={busy || !ready}>
          {holders.length === 1 ? "Ticket uitgeven" : `${holders.length} tickets uitgeven`}
        </Button>
        {canMultiple && (
          <Link href="/tickets/bulk" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            Een lijst uploaden (CSV of Excel)
          </Link>
        )}
      </div>
    </div>
  );
}
