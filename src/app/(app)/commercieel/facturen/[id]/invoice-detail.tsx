"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate, formatEuro, parseEuro } from "@/lib/commercial/client";

interface Line { description: string; quantity: number; unitCents: number; vatRateBp: number | null }
interface Doc {
  id: string; kind: "INVOICE" | "CREDIT_NOTE"; status: "DRAFT" | "ISSUED"; companyId: string; companyName: string; creditedInvoiceId: string | null;
  number: string | null; issuedOn: string | null; dueOn: string | null; deliveryText: string | null;
  buyerName: string; buyerAddress: string | null; buyerVatNumber: string | null; reference: string | null; version: number;
  lines: Line[];
  totals: { groups: { vatRateBp: number | null; netCents: number; vatCents: number }[]; netCents: number; vatCents: number; grossCents: number };
  creditedCents: number | null; paidCents: number | null; outstandingCents: number | null;
  payments: { id: string; amountCents: number; paidOn: string; note: string | null; voided: boolean }[];
}
interface LineDraft { description: string; quantity: string; price: string; vat: string }

const VAT_OPTIONS = [["", "Kies…"], ["0", "0%"], ["900", "9%"], ["2100", "21%"]];
const toLineDraft = (l: Line): LineDraft => ({ description: l.description, quantity: String(l.quantity), price: (l.unitCents / 100).toFixed(2).replace(".", ","), vat: l.vatRateBp == null ? "" : String(l.vatRateBp) });
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

export function InvoiceDetail({ id, permissions }: { id: string; permissions: string[] }) {
  const toast = useStableToast();
  const router = useRouter();
  const can = (p: string) => permissions.includes(p);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [head, setHead] = useState({ buyerName: "", buyerAddress: "", buyerVatNumber: "", reference: "", deliveryText: "" });
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState({ amount: "", paidOn: today(), note: "" });

  const apply = useCallback((d: Doc) => {
    setDoc(d);
    setLines(d.lines.map(toLineDraft));
    setHead({ buyerName: d.buyerName, buyerAddress: d.buyerAddress ?? "", buyerVatNumber: d.buyerVatNumber ?? "", reference: d.reference ?? "", deliveryText: d.deliveryText ?? "" });
  }, []);
  const load = useCallback(async () => {
    const r = await api<Doc>(`/api/commercial/invoices/${id}`);
    if (r.ok) apply(r.data); else toast.error(r.error);
  }, [id, apply, toast]);
  useEffect(() => {
    void api<Doc>(`/api/commercial/invoices/${id}`).then((r) => (r.ok ? apply(r.data) : toast.error(r.error)));
  }, [id, apply, toast]);

  if (!doc) return <p className="text-sm text-muted-foreground">Laden…</p>;
  const draft = doc.status === "DRAFT";
  const credit = doc.kind === "CREDIT_NOTE";
  const label = credit ? "creditnota" : "factuur";
  const editable = draft && !credit && can("invoices:update");

  function payload() {
    const parsed = lines.map((l, i) => {
      const cents = parseEuro(l.price);
      if (cents == null) throw new Error(`Regel ${i + 1}: vul een geldig bedrag in, bijvoorbeeld 2.500,00.`);
      return { description: l.description, quantity: Number(l.quantity) || 1, unitCents: cents, vatRateBp: l.vat === "" ? null : Number(l.vat) };
    });
    return { version: doc!.version, buyerName: head.buyerName, buyerAddress: head.buyerAddress || null, buyerVatNumber: head.buyerVatNumber || null, reference: head.reference || null, deliveryText: head.deliveryText || null, lines: parsed };
  }
  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) { toast.error(r.error ?? "Er is iets misgegaan."); return false; }
      toast.success(ok);
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Er is iets misgegaan."); return false; }
    finally { setBusy(false); }
  }
  const save = async () => { if (await run(async () => api(`/api/commercial/invoices/${id}`, "PUT", payload()) as never, "Concept opgeslagen.")) await load(); };
  const issue = async () => {
    if (editable && !(await run(async () => api(`/api/commercial/invoices/${id}`, "PUT", payload()) as never, "Concept opgeslagen."))) return;
    if (!window.confirm(`Deze ${label} definitief maken? Er wordt een nummer toegekend en daarna kan de inhoud niet meer worden gewijzigd.`)) return;
    if (await run(async () => api(`/api/commercial/invoices/${id}/issue`, "POST") as never, `De ${label} is definitief.`)) await load();
  };
  const discard = async () => {
    if (!window.confirm("Dit concept verwijderen?")) return;
    if (await run(async () => api(`/api/commercial/invoices/${id}`, "DELETE") as never, "Concept verwijderd.")) router.push("/commercieel/facturen");
  };
  const makeCredit = async () => {
    setBusy(true);
    const r = await api<{ id: string }>(`/api/commercial/invoices/${id}/credit`, "POST", {});
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    router.push(`/commercieel/facturen/${r.data.id}`);
  };
  const addPay = async () => {
    const cents = parseEuro(pay.amount);
    if (!cents) { toast.error("Vul een geldig bedrag in."); return; }
    if (await run(async () => api(`/api/commercial/invoices/${id}/payments`, "POST", { amountCents: cents, paidOn: pay.paidOn, note: pay.note || null }) as never, "Betaling geregistreerd.")) { setPay({ amount: "", paidOn: today(), note: "" }); await load(); }
  };
  const voidPay = async (pid: string) => {
    if (!window.confirm("Deze betaling ongeldig maken? Ze blijft zichtbaar in het overzicht.")) return;
    if (await run(async () => api(`/api/commercial/payments/${pid}`, "DELETE") as never, "Betaling ongeldig gemaakt.")) await load();
  };

  const setLine = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/commercieel/facturen" className="text-sm underline">← Facturen</Link>
        <h1 className="mt-1 text-2xl font-bold">{credit ? "Creditnota" : "Factuur"} {doc.number ?? "(concept)"}</h1>
        <p className="text-sm text-muted-foreground">
          <Link className="underline" href={`/commercieel/sponsoren/${doc.companyId}`}>{doc.companyName}</Link>
          {doc.issuedOn && <> · datum {formatDate(doc.issuedOn)}</>}{doc.dueOn && !credit && <> · vervaldatum {formatDate(doc.dueOn)}</>}
          {doc.creditedInvoiceId && <> · bij <Link className="underline" href={`/commercieel/facturen/${doc.creditedInvoiceId}`}>de oorspronkelijke factuur</Link></>}
        </p>
        {!draft && <p className="mt-2 rounded-md border border-border bg-muted p-2 text-sm">Definitief: de inhoud staat vast. Fouten corrigeer je met een creditnota.</p>}
      </div>

      <Card>
        <CardHeader><CardTitle>Koper</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="d-name">Naam</Label><Input id="d-name" value={head.buyerName} disabled={!editable} onChange={(e) => setHead({ ...head, buyerName: e.target.value })} /></div>
          <div><Label htmlFor="d-vat">Btw-nummer koper (optioneel)</Label><Input id="d-vat" value={head.buyerVatNumber} disabled={!editable} onChange={(e) => setHead({ ...head, buyerVatNumber: e.target.value })} /></div>
          <div><Label htmlFor="d-addr">Adres</Label><textarea id="d-addr" rows={3} className="mt-1 block w-full rounded-md border border-border bg-surface p-2 text-sm" value={head.buyerAddress} disabled={!editable} onChange={(e) => setHead({ ...head, buyerAddress: e.target.value })} /></div>
          <div className="space-y-3">
            <div><Label htmlFor="d-ref">Uw referentie (optioneel)</Label><Input id="d-ref" value={head.reference} disabled={!editable} onChange={(e) => setHead({ ...head, reference: e.target.value })} /></div>
            {!credit && <div><Label htmlFor="d-del">Geleverd: wat en wanneer</Label><Input id="d-del" value={head.deliveryText} disabled={!editable} placeholder="Bijvoorbeeld: sponsoring seizoen 2026/2027" onChange={(e) => setHead({ ...head, deliveryText: e.target.value })} /></div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Regels</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {editable ? (
            <>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_4rem_7rem_6rem_auto] items-end gap-2">
                  <div><Label htmlFor={`l-d-${i}`}>Omschrijving</Label><Input id={`l-d-${i}`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></div>
                  <div><Label htmlFor={`l-q-${i}`}>Aantal</Label><Input id={`l-q-${i}`} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></div>
                  <div><Label htmlFor={`l-p-${i}`}>Prijs excl. btw</Label><Input id={`l-p-${i}`} value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} /></div>
                  <div><Label htmlFor={`l-v-${i}`}>Btw</Label>
                    <select id={`l-v-${i}`} className="mt-1 block h-10 w-full rounded-md border border-border bg-surface px-2 text-sm" value={l.vat} onChange={(e) => setLine(i, { vat: e.target.value })}>{VAT_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
                  <Button variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Weg</Button>
                </div>
              ))}
              <Button variant="outline" onClick={() => setLines([...lines, { description: "", quantity: "1", price: "", vat: "" }])}>Regel toevoegen</Button>
              <p className="text-xs text-muted-foreground">Het btw-tarief kies je zelf per regel; het systeem rekent niets automatisch uit over vrijstellingen.</p>
            </>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th>Omschrijving</th><th className="text-right">Aantal</th><th className="text-right">Prijs</th><th className="text-right">Btw</th></tr></thead>
              <tbody>{doc.lines.map((l, i) => <tr key={i}><td className="py-1">{l.description}</td><td className="text-right">{l.quantity}</td><td className="text-right">{formatEuro(l.unitCents)}</td><td className="text-right">{l.vatRateBp == null ? "–" : `${l.vatRateBp / 100}%`}</td></tr>)}</tbody>
            </table>
          )}
          <div className="border-t border-border pt-2 text-sm">
            {doc.totals.groups.map((g) => <p key={String(g.vatRateBp)} className="flex justify-between"><span>Btw {g.vatRateBp == null ? "?" : `${g.vatRateBp / 100}%`} over {formatEuro(g.netCents)}</span><span>{formatEuro(g.vatCents)}</span></p>)}
            <p className="flex justify-between"><span>Totaal excl. btw</span><span>{formatEuro(doc.totals.netCents)}</span></p>
            <p className="flex justify-between font-semibold"><span>Totaal incl. btw{editable ? " (na opslaan)" : ""}</span><span>{formatEuro(doc.totals.grossCents)}</span></p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {editable && <Button disabled={busy} onClick={save}>Concept opslaan</Button>}
        {draft && (credit ? can("credit_notes:approve") : can("invoices:approve")) && <Button disabled={busy} onClick={issue}>Definitief maken</Button>}
        {draft && (credit ? can("credit_notes:create") : can("invoices:create")) && <Button variant="outline" disabled={busy} onClick={discard}>Concept verwijderen</Button>}
        {!draft && (credit ? can("credit_notes:download") : can("invoices:download")) && <a className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm" href={`/api/commercial/invoices/${id}/pdf`}>Pdf downloaden</a>}
        {!draft && !credit && can("credit_notes:create") && <Button variant="outline" disabled={busy} onClick={makeCredit}>Creditnota maken</Button>}
      </div>
      {!draft && !credit && <p className="text-xs text-muted-foreground">Het systeem verstuurt de factuur nog niet per e-mail: download de pdf en verstuur hem zelf.</p>}

      {!draft && !credit && doc.paidCents != null && (
        <Card>
          <CardHeader><CardTitle>Betalingen</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Betaald {formatEuro(doc.paidCents)} · gecrediteerd {formatEuro(doc.creditedCents)} · <strong>openstaand {formatEuro(doc.outstandingCents)}</strong></p>
            <ul className="divide-y divide-border">
              {doc.payments.map((p) => (
                <li key={p.id} className={`flex items-center justify-between py-1.5 ${p.voided ? "text-muted-foreground line-through" : ""}`}>
                  <span>{formatDate(p.paidOn)} · {formatEuro(p.amountCents)}{p.note ? ` · ${p.note}` : ""}{p.voided ? " (ongeldig)" : ""}</span>
                  {!p.voided && can("payments:update") && <Button variant="ghost" disabled={busy} onClick={() => void voidPay(p.id)}>Ongeldig maken</Button>}
                </li>
              ))}
            </ul>
            {can("payments:create") && (
              <div className="flex flex-wrap items-end gap-2">
                <div><Label htmlFor="p-a">Bedrag</Label><Input id="p-a" className="w-28" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
                <div><Label htmlFor="p-d">Datum</Label><Input id="p-d" type="date" value={pay.paidOn} onChange={(e) => setPay({ ...pay, paidOn: e.target.value })} /></div>
                <div><Label htmlFor="p-n">Notitie</Label><Input id="p-n" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></div>
                <Button disabled={busy} onClick={addPay}>Betaling registreren</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
