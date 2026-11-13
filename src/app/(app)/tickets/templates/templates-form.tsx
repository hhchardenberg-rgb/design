"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { TEMPLATE_VARIABLES } from "@/lib/tickets/delivery";
import { api, errorText, PageTitle } from "@/components/tickets/parts";

interface Tpl {
  key: string;
  name: string;
  subject: string;
  body: string;
  custom: boolean;
}

export function TemplatesForm() {
  const toast = useStableToast();
  const [list, setList] = useState<Tpl[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ templates: Tpl[] }>("/api/tickets/templates").then(
      (r) => setList(r.templates),
      (e) => toast.error(errorText(e)),
    );
  }, [toast]);

  async function save(t: Tpl, reset = false) {
    setBusy(true);
    try {
      await api(`/api/tickets/templates/${t.key}`, { method: "PUT", body: reset ? { reset: true } : { subject: t.subject, body: t.body } });
      toast.success(reset ? "Standaardtekst hersteld." : "Template opgeslagen.");
      const r = await api<{ templates: Tpl[] }>("/api/tickets/templates");
      setList(r.templates);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!list) return <p className="text-sm text-muted-foreground">Laden…</p>;
  return (
    <div className="space-y-6">
      <PageTitle title="E-mail en wallet" description="De tekst van de ticketmail en de status van Apple Wallet en Google Wallet." />
      {list.map((t) => (
        <Card key={t.key}>
          <CardHeader>
            <CardTitle className="text-base">{t.name}</CardTitle>
            <CardDescription>
              Beschikbaar: {TEMPLATE_VARIABLES.map((v) => `{${v.key}}`).join(", ")}. De knop “Bekijk je ticket” met de persoonlijke link staat altijd onder de tekst.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor={`s-${t.key}`}>Onderwerp</Label>
              <Input id={`s-${t.key}`} value={t.subject} onChange={(e) => setList(list.map((x) => (x.key === t.key ? { ...x, subject: e.target.value } : x)))} />
            </div>
            <div>
              <Label htmlFor={`b-${t.key}`}>Tekst</Label>
              <Textarea id={`b-${t.key}`} rows={9} value={t.body} onChange={(e) => setList(list.map((x) => (x.key === t.key ? { ...x, body: e.target.value } : x)))} />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => save(t)} disabled={busy}>
                Opslaan
              </Button>
              {t.custom && (
                <Button variant="outline" onClick={() => save(t, true)} disabled={busy}>
                  Standaardtekst herstellen
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apple Wallet en Google Wallet</CardTitle>
          <CardDescription>Nog niet gekoppeld.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Voor wallet-passen heeft HHC een Apple Developer-account (met Pass Type ID en certificaat) en een Google Wallet-issueraccount nodig. Zodra die er zijn, wordt “Toevoegen aan wallet” op de ticketpagina geactiveerd. Tot die tijd werkt het ticket via de persoonlijke link, de QR-code en de PDF.
        </CardContent>
      </Card>
    </div>
  );
}
