"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TierBadge } from "@/components/commercial/sponsor-tier";
import { KIND } from "@/components/commercial/activity-list";
import { api, formatDate, formatEuro } from "@/lib/commercial/client";
import { useStableToast as useToast } from "@/lib/commercial/use-stable-toast";

const STATUS: Record<string, string> = { PROSPECT: "Potentieel", ACTIVE: "Actief", FORMER: "Voormalig" };
const CONTRACT_STATUS: Record<string, string> = { DRAFT: "Concept", ACTIVE: "Lopend", ENDED: "Beëindigd", CANCELLED: "Geannuleerd" };
const STAGE: Record<string, string> = { LEAD: "Nieuwe kans", CONTACTED: "In gesprek", PROPOSAL: "Voorstel gedaan", NEGOTIATION: "Onderhandeling", WON: "Gewonnen", LOST: "Verloren" };
const FILE_CATEGORY: Record<string, string> = { LOGO: "Logo", CONTRACT: "Contract", QUOTE: "Offerte", AD: "Advertentie of materiaal", PROOF: "Uitvoeringsbewijs", OTHER: "Overig" };
const INVOICE_STATUS: Record<string, string> = { DRAFT: "Concept", ISSUED: "Definitief" };

interface Detail {
  company: Record<string, unknown> & {
    id: string; name: string; status: string; sponsorTier: string | null; tags: string[]; ownerName: string | null;
    deletedAt: string; deletedByLabel: string | null; deleteReason: string | null; archivedAt: string | null; createdAt: string;
  };
  counts: Record<string, number>;
  contacts: { id: string; name: string; jobTitle: string | null; email: string | null; phone: string | null; role: string | null; archived: boolean }[];
  activities: { id: string; kind: string; occurredAt: string; isPlanned: boolean; summary: string; contactName: string | null; archived: boolean }[];
  tasks: { id: string; title: string; status: string; dueAt: string | null }[];
  files: { id: string; name: string; category: string; version: number; archived: boolean; createdAt: string }[];
  contracts: { id: string; seasonName: string; status: string; startsOn: string; endsOn: string; amountCents: number | null; archived: boolean }[];
  opportunities: { id: string; title: string; stage: string; archived: boolean }[];
  invoices: { id: string; kind: string; status: string; number: string | null; issuedOn: string | null; createdAt: string }[];
  canRestore: boolean;
}

const FIELDS: [string, string][] = [
  ["tradeName", "Handelsnaam"], ["street", "Adres"], ["postalCode", "Postcode"], ["city", "Plaats"], ["country", "Land"],
  ["website", "Website"], ["email", "Algemeen e-mailadres"], ["phone", "Telefoon"], ["kvkNumber", "KvK-nummer"], ["vatNumber", "Btw-nummer"],
  ["billingName", "Factuur t.a.v."], ["billingEmail", "Factuur e-mailadres"], ["billingAddress", "Factuuradres"], ["industry", "Branche"],
  ["source", "Herkomst van de relatie"], ["internalNotes", "Interne opmerkingen"],
];

export function DeletedCompanyDetail({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Detail>(`/api/commercial/deleted-archive/${id}`);
    if (r.ok) setData(r.data);
    else setError(r.error);
  }, [id]);
  useEffect(() => void load(), [load]);

  async function restore() {
    setBusy(true);
    const r = await api(`/api/commercial/deleted-archive/${id}/restore`, "POST");
    if (r.ok) {
      toast.success("Dossier teruggezet. Het staat weer gewoon bij Sponsoren.");
      router.push(`/commercieel/sponsoren/${id}`);
    } else {
      setBusy(false);
      toast.error(r.error);
    }
  }

  const back = <Link href="/commercieel/toezicht/archief" className="inline-flex items-center gap-1 text-sm text-hhc-orange-dark"><ArrowLeft className="h-4 w-4" /> Gesloten archief</Link>;
  if (error) return <div className="space-y-4">{back}<p role="alert" className="text-sm text-destructive">{error}</p></div>;
  if (!data) return <div className="space-y-4">{back}<p className="text-sm text-muted-foreground">Laden…</p></div>;
  const c = data.company;

  return (
    <div className="space-y-5">
      {back}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{c.name}</h1>
        <Badge variant="outline">{STATUS[c.status] ?? c.status}</Badge>
        {c.sponsorTier && <TierBadge tier={c.sponsorTier} />}
        <Badge variant="outline"><Lock className="mr-1 inline h-3 w-3" /> Verwijderd</Badge>
      </div>

      <Card className="border-hhc-orange/40">
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5 text-sm">
          <div className="space-y-1">
            <p>Verwijderd op <strong>{formatDate(c.deletedAt, true)}</strong> door <strong>{c.deletedByLabel ?? "onbekend"}</strong>.</p>
            {c.deleteReason && <p>Reden: {c.deleteReason}</p>}
            <p className="text-muted-foreground">Dit dossier is alleen-lezen. Na terugzetten staat het, met alles wat eraan vastzit, weer in de gewone lijsten.</p>
          </div>
          {data.canRestore && !confirming && (
            <Button onClick={() => setConfirming(true)}><RotateCcw className="h-4 w-4" /> Terugzetten</Button>
          )}
          {data.canRestore && confirming && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Weet je zeker dat je dit dossier wilt terugzetten?</span>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>Annuleren</Button>
              <Button onClick={restore} disabled={busy}>{busy ? "Terugzetten…" : "Ja, terugzetten"}</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Gegevens</CardTitle></CardHeader>
        <CardContent className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {FIELDS.filter(([k]) => c[k]).map(([k, label]) => (
            <div key={k}>
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="whitespace-pre-wrap">{String(c[k])}</div>
            </div>
          ))}
          <div><div className="text-xs text-muted-foreground">Verantwoordelijke</div><div>{c.ownerName ?? "Niemand"}</div></div>
          <div><div className="text-xs text-muted-foreground">Aangemaakt op</div><div>{formatDate(c.createdAt)}</div></div>
          {c.tags.length > 0 && <div className="sm:col-span-2"><div className="text-xs text-muted-foreground">Tags</div><div>{c.tags.join(", ")}</div></div>}
        </CardContent>
      </Card>

      <Section title="Contactpersonen" count={data.counts.contacts} empty={data.contacts.length === 0}>
        {data.contacts.map((p) => (
          <li key={p.id} className="px-4 py-2">
            <span className="font-medium">{p.name}</span>{p.archived && <Archived />}
            <div className="text-xs text-muted-foreground">{[p.jobTitle, p.role, p.email, p.phone].filter(Boolean).join(" · ")}</div>
          </li>
        ))}
      </Section>

      <Section title="Contacthistorie" count={data.counts.activities} empty={data.activities.length === 0}>
        {data.activities.map((a) => (
          <li key={a.id} className="px-4 py-2">
            <div className="text-xs text-muted-foreground">
              {formatDate(a.occurredAt, true)} · {KIND[a.kind] ?? a.kind}{a.isPlanned ? " (gepland)" : ""}{a.contactName ? ` · met ${a.contactName}` : ""}{a.archived && <Archived />}
            </div>
            <div className="whitespace-pre-wrap">{a.summary}</div>
          </li>
        ))}
      </Section>

      <Section title="Contracten" count={data.counts.contracts} empty={data.contracts.length === 0}>
        {data.contracts.map((k) => (
          <li key={k.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
            <span>{k.seasonName} · {CONTRACT_STATUS[k.status] ?? k.status}{k.archived && <Archived />}</span>
            <span className="text-muted-foreground">{formatDate(k.startsOn)} t/m {formatDate(k.endsOn)}{k.amountCents != null ? ` · ${formatEuro(k.amountCents)}` : ""}</span>
          </li>
        ))}
      </Section>

      {data.invoices.length > 0 && (
        <Section title="Facturen en creditnota's" count={data.counts.invoices} empty={false}>
          {data.invoices.map((f) => (
            <li key={f.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
              <span>{f.kind === "CREDIT_NOTE" ? "Creditnota" : "Factuur"} {f.number ?? "(concept)"}</span>
              <span className="text-muted-foreground">{INVOICE_STATUS[f.status] ?? f.status} · {formatDate(f.issuedOn ?? f.createdAt)}</span>
            </li>
          ))}
        </Section>
      )}

      <Section title="Kansen" count={data.counts.opportunities} empty={data.opportunities.length === 0}>
        {data.opportunities.map((o) => (
          <li key={o.id} className="px-4 py-2">{o.title} · <span className="text-muted-foreground">{STAGE[o.stage] ?? o.stage}</span>{o.archived && <Archived />}</li>
        ))}
      </Section>

      <Section title="Taken" count={data.counts.tasks} empty={data.tasks.length === 0}>
        {data.tasks.map((t) => (
          <li key={t.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
            <span>{t.title}</span>
            <span className="text-muted-foreground">{t.status === "DONE" ? "Afgerond" : "Open"}{t.dueAt ? ` · ${formatDate(t.dueAt)}` : ""}</span>
          </li>
        ))}
      </Section>

      <Section title="Bestanden" count={data.counts.files} empty={data.files.length === 0}>
        {data.files.map((f) => (
          <li key={f.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
            <span>{f.name}{f.version > 1 ? ` (versie ${f.version})` : ""}{f.archived && <Archived />}</span>
            <span className="text-muted-foreground">{FILE_CATEGORY[f.category] ?? f.category} · {formatDate(f.createdAt)}</span>
          </li>
        ))}
      </Section>
    </div>
  );
}

function Archived() {
  return <span className="ml-2 text-xs text-muted-foreground">(gearchiveerd)</span>;
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title} <span className="text-sm font-normal text-muted-foreground">({count})</span></CardTitle></CardHeader>
      <CardContent className="p-0">
        {empty ? <p className="px-4 pb-4 text-sm text-muted-foreground">Geen.</p> : <ul className="divide-y divide-border text-sm">{children}</ul>}
      </CardContent>
    </Card>
  );
}
