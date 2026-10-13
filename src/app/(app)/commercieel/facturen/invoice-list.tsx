"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate, formatEuro } from "@/lib/commercial/client";

interface Row { id: string; kind: string; status: string; number: string | null; issuedOn: string | null; companyName: string; buyerName: string; totals: { grossCents: number }; outstandingCents: number | null; createdAt: string }
interface Hit { id: string; name: string; city?: string | null }
interface ContractOpt { id: string; seasonName: string; packageName: string | null; status: string }

export function InvoiceList({ canCreate }: { canCreate: boolean }) {
  const toast = useStableToast();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [company, setCompany] = useState<Hit | null>(null);
  const [contracts, setContracts] = useState<ContractOpt[]>([]);
  const [contractId, setContractId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ invoices: Row[] }>("/api/commercial/invoices").then((r) => (r.ok ? setRows(r.data.invoices) : toast.error(r.error)));
  }, [toast]);

  async function search(value: string) {
    setQ(value);
    if (value.trim().length < 2) { setHits([]); return; }
    const r = await api<{ rows: Hit[] }>(`/api/commercial/companies?q=${encodeURIComponent(value)}&pageSize=8`);
    if (r.ok) setHits(r.data.rows);
  }
  async function pick(h: Hit) {
    setCompany(h); setHits([]); setQ(h.name); setContractId("");
    const r = await api<{ rows: ContractOpt[] }>(`/api/commercial/contracts?companyId=${h.id}`);
    setContracts(r.ok ? r.data.rows : []);
  }
  async function create() {
    if (!company) return;
    setBusy(true);
    const r = await api<{ id: string }>("/api/commercial/invoices", "POST", { companyId: company.id, contractId: contractId || null });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    router.push(`/commercieel/facturen/${r.data.id}`);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Facturen</h1>
        <p className="text-sm text-muted-foreground">Facturen en creditnota&apos;s binnen jouw bereik. Een concept heeft nog geen nummer; pas bij definitief maken wordt het nummer toegekend.</p>
      </div>
      {canCreate && (
        <Card>
          <CardHeader><CardTitle>Nieuwe factuur</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="relative"><Label htmlFor="nf-company">Sponsor</Label>
              <Input id="nf-company" className="w-64" value={q} onChange={(e) => void search(e.target.value)} placeholder="Zoek een sponsor…" />
              {hits.length > 0 && <ul className="absolute z-10 mt-1 w-64 rounded-md border border-border bg-surface text-sm shadow">{hits.map((h) => <li key={h.id}><button className="w-full px-2 py-1.5 text-left hover:bg-muted" onClick={() => void pick(h)}>{h.name}{h.city ? ` (${h.city})` : ""}</button></li>)}</ul>}
            </div>
            {company && (
              <div><Label htmlFor="nf-contract">Op basis van contract</Label>
                <select id="nf-contract" className="mt-1 block h-10 rounded-md border border-border bg-surface px-2 text-sm" value={contractId} onChange={(e) => setContractId(e.target.value)}>
                  <option value="">Geen (losse factuur)</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.seasonName}{c.packageName ? ` – ${c.packageName}` : ""}</option>)}
                </select></div>
            )}
            <Button disabled={!company || busy} onClick={create}>Concept maken</Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="pt-5">
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen facturen.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-1">Nummer</th><th className="py-1">Sponsor</th><th className="py-1">Datum</th><th className="py-1 text-right">Bedrag</th><th className="py-1 text-right">Openstaand</th></tr></thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5"><Link className="underline" href={`/commercieel/facturen/${r.id}`}>{r.number ?? "Concept"}</Link>{r.kind === "CREDIT_NOTE" ? " (creditnota)" : ""}</td>
                    <td className="py-1.5">{r.buyerName}</td>
                    <td className="py-1.5">{formatDate(r.issuedOn ?? r.createdAt)}</td>
                    <td className="py-1.5 text-right">{formatEuro(r.totals.grossCents)}</td>
                    <td className="py-1.5 text-right">{r.outstandingCents == null ? "–" : formatEuro(r.outstandingCents)}</td>
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
