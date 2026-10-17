"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api } from "@/lib/commercial/client";

interface Recipient { id: string; kind: "user" | "email"; name: string | null; email: string | null }
interface Candidate { id: string; name: string; email: string }
interface Data { live: boolean; recipients: Recipient[]; candidates: Candidate[] }

export function NotificationSettings({ canEdit }: { canEdit: boolean }) {
  const toast = useStableToast();
  const [data, setData] = useState<Data | null>(null);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Data>("/api/commercial/notification-recipients");
    if (r.ok) setData(r.data);
    else toast.error(r.error);
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function add(body: Record<string, string>, done: () => void) {
    setBusy(true);
    const r = await api("/api/commercial/notification-recipients", "POST", body);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    done();
    toast.success("Ontvanger toegevoegd.");
    await load();
  }
  async function remove(x: Recipient) {
    if (!confirm(`${x.name ?? x.email} krijgt dan geen melding meer bij een nieuw contract. Doorgaan?`)) return;
    const r = await api(`/api/commercial/notification-recipients/${x.id}`, "DELETE");
    if (!r.ok) return toast.error(r.error);
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meldingen</h1>
        <p className="mt-1 text-muted-foreground">Wie een e-mail krijgt zodra er een nieuw sponsorcontract is afgesloten.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nieuw sponsorcontract</CardTitle>
          <CardDescription>
            De melding gaat uit op het moment dat een contract van concept naar actief gaat. Er staan sponsor, sponsorvorm, seizoen, pakket, looptijd en wie het afsloot in; nooit bedragen.
            Je kunt Hub-gebruikers aanwijzen en losse e-mailadressen, bijvoorbeeld van bestuursleden zonder account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data && !data.live && (
            <p className="rounded-md border border-border bg-surface-muted p-3 text-sm">Dit is een testomgeving: hier worden geen meldingen echt verstuurd. Bij het activeren van een contract zie je wel naar hoeveel mensen hij zou gaan.</p>
          )}
          {!data ? <p className="text-sm text-muted-foreground">Laden…</p> : data.recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog niemand aangewezen: er gaan geen meldingen uit.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {data.recipients.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{x.name ?? x.email}</div>
                    <div className="text-xs text-muted-foreground">{x.kind === "user" ? `Hub-gebruiker · ${x.email ?? "geen e-mailadres"}` : `Los e-mailadres${x.name ? ` · ${x.email}` : ""}`}</div>
                  </div>
                  {canEdit && <Button variant="ghost" size="sm" onClick={() => remove(x)}>Verwijderen</Button>}
                </li>
              ))}
            </ul>
          )}
          {canEdit && data ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (userId) void add({ userId }, () => setUserId("")); }}>
                <Label htmlFor="nr-user">Hub-gebruiker toevoegen</Label>
                <div className="flex gap-2">
                  <select id="nr-user" className="h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-sm" value={userId} onChange={(e) => setUserId(e.target.value)}>
                    <option value="">Kies een gebruiker…</option>
                    {data.candidates.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                  </select>
                  <Button type="submit" disabled={busy || !userId}>Toevoegen</Button>
                </div>
              </form>
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void add({ email, name }, () => { setEmail(""); setName(""); }); }}>
                <Label htmlFor="nr-email">Los e-mailadres toevoegen</Label>
                <div className="flex flex-wrap gap-2">
                  <Input id="nr-email" type="email" required placeholder="naam@voorbeeld.nl" className="min-w-48 flex-1" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <Input aria-label="Naam (optioneel)" placeholder="Naam (optioneel)" className="min-w-36 flex-1" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
                  <Button type="submit" disabled={busy || !email}>Toevoegen</Button>
                </div>
              </form>
            </div>
          ) : data && <p className="text-xs text-muted-foreground">Alleen beheerders kunnen ontvangers aanwijzen.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
