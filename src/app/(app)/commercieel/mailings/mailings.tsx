"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate } from "@/lib/commercial/client";
import { renderMailing } from "@/lib/commercial/mail-render";

interface Row { id: string; subject: string; status: string; sentAt: string | null; createdAt: string; counts: Record<string, number> }
interface Recipient { id: string; email: string; name: string | null; status: string; error: string | null }
interface Detail { id: string; subject: string; bodyText: string; audienceStatus: string | null; status: string; version: number; recipients: Recipient[] }

const STATUS: Record<string, string> = { DRAFT: "Concept", SENDING: "Wordt verstuurd", SENT: "Verstuurd" };
const R_STATUS: Record<string, string> = { PENDING: "Wacht", SENDING: "Bezig", SENT: "Verstuurd", DELIVERED: "Afgeleverd", BOUNCED: "Gebounced", COMPLAINED: "Klacht", FAILED: "Mislukt", SKIPPED: "Overgeslagen" };

/** Voorbeeld van de mail in een pop-up, opgebouwd met dezelfde functie als bij het echte verzenden. */
function PreviewDialog({ subject, bodyText, name, onClose }: { subject: string; bodyText: string; name: string | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const { html } = renderMailing(bodyText, name, "#", { logoUrl: `${window.location.origin}/branding/hhc-logo.png` });
  const doc = html.replace("<body", '<head><meta charset="utf-8"><base target="_blank"></head><body');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="ml-prev-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 id="ml-prev-title" className="text-lg font-semibold">Voorbeeld van de e-mail</h2>
            <p className="text-sm"><span className="text-muted-foreground">Onderwerp:</span> {subject || "(nog leeg)"}</p>
            <p className="text-xs text-muted-foreground">Voorbeeld voor {name ?? "een ontvanger"}. De afmeldlink werkt pas in de echte mail.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} autoFocus>Sluiten</Button>
        </div>
        <iframe title="Voorbeeld van de e-mail" sandbox="" srcDoc={doc} className="min-h-80 w-full flex-1 rounded-b-lg bg-white" />
      </div>
    </div>
  );
}

export function Mailings({ canCreate, canUpdate, canSend }: { canCreate: boolean; canUpdate: boolean; canSend: boolean }) {
  const toast = useStableToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [audience, setAudience] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [testTo, setTestTo] = useState("");

  const loadList = useCallback(async () => {
    const r = await api<{ mailings: Row[] }>("/api/commercial/mailings");
    if (r.ok) setRows(r.data.mailings);
  }, []);
  useEffect(() => {
    void api<{ mailings: Row[] }>("/api/commercial/mailings").then((r) => r.ok && setRows(r.data.mailings));
  }, []);

  async function open(id: string) {
    const r = await api<Detail>(`/api/commercial/mailings/${id}`);
    if (!r.ok) { toast.error(r.error); return; }
    setDetail(r.data);
    setSubject(r.data.subject);
    setBodyText(r.data.bodyText);
    setAudience(r.data.audienceStatus ?? "");
  }
  function startNew() { setDetail(null); setSubject(""); setBodyText(""); setAudience(""); }

  async function save() {
    setBusy(true);
    const payload = { subject, bodyText, audienceStatus: audience || null };
    const r = detail ? await api(`/api/commercial/mailings/${detail.id}`, "PUT", { ...payload, version: detail.version }) : await api<{ id: string }>("/api/commercial/mailings", "POST", payload);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Opgeslagen.");
    await loadList();
    await open(detail ? detail.id : (r.data as { id: string }).id);
  }
  async function act(path: string, done: (data: never) => string) {
    if (!detail) return;
    setBusy(true);
    const r = await api(`/api/commercial/mailings/${detail.id}/${path}`, "POST");
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(done(r.data as never));
    await loadList();
    await open(detail.id);
  }

  async function sendTest() {
    setBusy(true);
    const r = await api<{ sentTo: string }>("/api/commercial/mailings/test", "POST", { to: testTo, subject, bodyText, name: "Jan de Vries" });
    setBusy(false);
    if (r.ok) toast.success(`Testmail verstuurd naar ${r.data.sentTo}.`);
    else toast.error(r.error);
  }

  const draft = !detail || detail.status === "DRAFT";
  const pending = detail?.recipients.filter((r) => r.status === "PENDING").length ?? 0;
  const failed = detail?.recipients.filter((r) => r.status === "FAILED").length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Mailings</h1>
        <p className="text-sm text-muted-foreground">Verstuur een bericht aan sponsorcontacten binnen jouw bereik. Elke mail bevat een afmeldlink; afgemelde adressen, ongeldige adressen en dubbelen worden overgeslagen. Gebruik {"{{naam}}"} voor de naam van het contact.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Mailings</CardTitle>{canCreate && <Button variant="outline" onClick={startNew}>Nieuw</Button>}</CardHeader>
          <CardContent>
            {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen mailings.</p> : (
              <ul className="divide-y divide-border text-sm">
                {rows.map((r) => (
                  <li key={r.id}><button className="w-full py-2 text-left hover:underline" onClick={() => open(r.id)}>
                    <span className="font-medium">{r.subject}</span><br />
                    <span className="text-xs text-muted-foreground">{STATUS[r.status] ?? r.status} · {formatDate(r.sentAt ?? r.createdAt)}{Object.keys(r.counts).length ? " · " + Object.entries(r.counts).map(([k, v]) => `${v} ${R_STATUS[k]?.toLowerCase() ?? k}`).join(", ") : ""}</span>
                  </button></li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{detail ? "Mailing" : "Nieuwe mailing"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label htmlFor="ml-subject">Onderwerp</Label><Input id="ml-subject" value={subject} disabled={!draft} onChange={(e) => setSubject(e.target.value)} /></div>
            <div><Label htmlFor="ml-body">Bericht</Label>
              <textarea id="ml-body" rows={9} className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-sm" value={bodyText} disabled={!draft} onChange={(e) => setBodyText(e.target.value)} /></div>
            <div><Label htmlFor="ml-aud">Doelgroep</Label>
              <select id="ml-aud" className="block h-10 rounded-md border border-border bg-surface px-2 text-sm" value={audience} disabled={!draft} onChange={(e) => setAudience(e.target.value)}>
                <option value="">Alle dossiers binnen mijn bereik</option><option value="ACTIVE">Alleen actieve sponsoren</option><option value="PROSPECT">Alleen prospects</option><option value="FORMER">Alleen oud-sponsoren</option>
              </select></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!bodyText.trim()} onClick={() => setPreviewing(true)}>Voorbeeld bekijken</Button>
              {draft && (detail ? canUpdate : canCreate) && <Button disabled={busy || !subject.trim() || !bodyText.trim()} onClick={save}>Opslaan</Button>}
              {detail && detail.status === "DRAFT" && canUpdate && <Button variant="outline" disabled={busy} onClick={() => act("prepare", (d: { recipients: number }) => `${d.recipients} ontvanger(s) vastgelegd.`)}>Ontvangers voorbereiden</Button>}
              {detail && detail.status !== "SENT" && canSend && pending > 0 && (
                <Button disabled={busy} onClick={() => { if (window.confirm(`Mailing "${detail.subject}" nu versturen naar ${pending} ontvanger(s)? Dit kan niet ongedaan worden gemaakt.`)) void act("send", (d: { sent: number; failed: number; skipped: number }) => `Verstuurd: ${d.sent}, mislukt: ${d.failed}, overgeslagen: ${d.skipped}.`); }}>Versturen</Button>
              )}
              {detail && canSend && failed > 0 && <Button variant="outline" disabled={busy} onClick={() => act("retry", (d: { requeued: number }) => `${d.requeued} opnieuw klaargezet; klik op Versturen.`)}>Mislukte opnieuw proberen</Button>}
            </div>
            {canSend && (
              <div className="rounded-md border border-border p-3">
                <Label htmlFor="ml-test">Testmail naar</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input id="ml-test" type="email" className="min-w-56 flex-1" placeholder="naam@voorbeeld.nl" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                  <Button variant="outline" disabled={busy || !testTo.trim() || !subject.trim() || !bodyText.trim()} onClick={sendTest}>Testmail versturen</Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Verstuurt het bericht zoals het nu in het scherm staat (ook zonder op te slaan) naar dit adres, met &ldquo;Jan de Vries&rdquo; als naam. Er gaat niets naar sponsoren. Maximaal 10 per uur.</p>
              </div>
            )}
            {detail && (
              <div>
                <h3 className="mt-2 text-sm font-semibold">Ontvangers ({detail.recipients.length})</h3>
                {detail.recipients.length === 0 ? <p className="text-sm text-muted-foreground">Nog niet voorbereid.</p> : (
                  <table className="mt-1 w-full text-sm"><tbody className="divide-y divide-border">
                    {detail.recipients.map((r) => <tr key={r.id}><td className="py-1">{r.name ?? ""} <span className="text-muted-foreground">{r.email}</span></td><td className="py-1 text-right">{R_STATUS[r.status] ?? r.status}{r.error ? ` (${r.error})` : ""}</td></tr>)}
                  </tbody></table>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {previewing && <PreviewDialog subject={subject} bodyText={bodyText} name={detail?.recipients.find((r) => r.name)?.name ?? "Jan de Vries"} onClose={() => setPreviewing(false)} />}
    </div>
  );
}
