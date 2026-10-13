"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api } from "@/lib/commercial/client";

interface S {
  legalName: string | null; street: string | null; postalCode: string | null; city: string | null; kvkNumber: string | null;
  vatNumber: string | null; iban: string | null; paymentTermDays: number | null;
  invoicePrefix: string | null; nextInvoiceNumber: number | null; creditPrefix: string | null; nextCreditNumber: number | null; version: number;
}

type Draft = Record<keyof Omit<S, "version">, string>;
const toDraft = (s: S): Draft => ({
  legalName: s.legalName ?? "", street: s.street ?? "", postalCode: s.postalCode ?? "", city: s.city ?? "", kvkNumber: s.kvkNumber ?? "",
  vatNumber: s.vatNumber ?? "", iban: s.iban ?? "", paymentTermDays: s.paymentTermDays?.toString() ?? "",
  invoicePrefix: s.invoicePrefix ?? "", nextInvoiceNumber: s.nextInvoiceNumber?.toString() ?? "", creditPrefix: s.creditPrefix ?? "", nextCreditNumber: s.nextCreditNumber?.toString() ?? "",
});
const num = (v: string) => (v.trim() === "" ? null : Number(v));

export function InvoiceSettingsForm({ canEdit }: { canEdit: boolean }) {
  const toast = useStableToast();
  const [version, setVersion] = useState<number | null>(null);
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<S>("/api/commercial/invoice-settings").then((r) => {
      if (!r.ok) { toast.error(r.error); return; }
      setVersion(r.data.version);
      setD(toDraft(r.data));
    });
  }, [toast]);

  if (!d || version == null) return <p className="text-sm text-muted-foreground">Laden…</p>;
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });
  const field = (k: keyof Draft, label: string, hint?: string, width = "") => (
    <div>
      <Label htmlFor={`is-${k}`}>{label}</Label>
      <Input id={`is-${k}`} className={width} value={d[k]} disabled={!canEdit} onChange={set(k)} />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  async function save() {
    if (!d) return;
    setBusy(true);
    const body = {
      legalName: d.legalName, street: d.street, postalCode: d.postalCode, city: d.city, kvkNumber: d.kvkNumber, vatNumber: d.vatNumber, iban: d.iban,
      paymentTermDays: num(d.paymentTermDays), invoicePrefix: d.invoicePrefix, nextInvoiceNumber: num(d.nextInvoiceNumber), creditPrefix: d.creditPrefix, nextCreditNumber: num(d.nextCreditNumber), version,
    };
    const r = await api("/api/commercial/invoice-settings", "PUT", body);
    if (!r.ok) { setBusy(false); toast.error(r.error); return; }
    const fresh = await api<S>("/api/commercial/invoice-settings");
    setBusy(false);
    if (fresh.ok) { setVersion(fresh.data.version); setD(toDraft(fresh.data)); }
    toast.success("Opgeslagen.");
  }

  const missing = [!d.vatNumber && "btw-identificatienummer", !d.iban && "IBAN", !d.paymentTermDays && "betalingstermijn", !d.nextInvoiceNumber && "volgnummer voor facturen", !d.nextCreditNumber && "volgnummer voor creditnota's"].filter(Boolean);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Facturatie-instellingen</h1>
        <p className="text-sm text-muted-foreground">Deze gegevens komen op facturen en creditnota&apos;s. Bij het definitief maken worden ze vastgelegd op het document; latere wijzigingen veranderen eerdere facturen niet.</p>
      </div>
      {missing.length > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Facturen kunnen pas definitief worden gemaakt als dit is ingevuld: {missing.join(", ")}.
        </p>
      )}
      <Card>
        <CardHeader><CardTitle>Gegevens van de vereniging</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {field("legalName", "Naam van de vereniging")}
          {field("kvkNumber", "KvK-nummer", "8 cijfers")}
          {field("street", "Straat en huisnummer")}
          <div className="grid grid-cols-2 gap-3">{field("postalCode", "Postcode")}{field("city", "Plaats")}</div>
          {field("vatNumber", "Btw-identificatienummer", "Bijvoorbeeld NL123456789B01. Staat bewust nog leeg.")}
          {field("iban", "IBAN", "Wordt gecontroleerd. Staat bewust nog leeg.")}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Betaling en nummering</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {field("paymentTermDays", "Betalingstermijn in dagen", "De vervaldatum is de factuurdatum plus dit aantal dagen.", "w-32")}
          <div />
          {field("invoicePrefix", "Voorvoegsel factuurnummer", "Bijvoorbeeld 2026- ; leeg is toegestaan.", "w-40")}
          {field("nextInvoiceNumber", "Volgend factuurnummer", "Nummers lopen door zonder gaten. Na de eerste uitgegeven factuur kan dit alleen nog omhoog.", "w-40")}
          {field("creditPrefix", "Voorvoegsel creditnota", "Moet verschillen van dat van facturen, bijvoorbeeld CN-.", "w-40")}
          {field("nextCreditNumber", "Volgend creditnotanummer", undefined, "w-40")}
        </CardContent>
      </Card>
      {canEdit ? <Button disabled={busy} onClick={save}>Opslaan</Button> : <p className="text-xs text-muted-foreground">Wijzigen vereist de bevoegdheid om instellingen te beheren.</p>}
    </div>
  );
}
