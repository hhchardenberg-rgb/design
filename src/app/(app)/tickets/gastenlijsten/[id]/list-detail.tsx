"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, errorText } from "@/components/tickets/parts";
import { EMPTY_SETTINGS, IssueSettings, issueBody, type IssueSettingsValue } from "@/components/tickets/issue-settings";

interface Detail {
  id: string;
  name: string;
  kind: string;
  members: { id: string; firstName: string; lastName: string; email: string | null; company: string | null; seats: number }[];
}

export function ListDetail({ id, canIssue, canResend }: { id: string; canIssue: boolean; canResend: boolean }) {
  const toast = useStableToast();
  const [d, setD] = useState<Detail | null>(null);
  const [paste, setPaste] = useState("");
  const [settings, setSettings] = useState<IssueSettingsValue>(EMPTY_SETTINGS);
  const [mail, setMail] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setD(await api<Detail>(`/api/tickets/guestlists/${id}`));
    } catch (e) {
      toast.error(errorText(e));
    }
  }, [id, toast]);
  useEffect(() => void load(), [load]);

  async function add() {
    setBusy(true);
    try {
      const r = await api<{ added: number; errors: { line: number; message: string }[] }>(`/api/tickets/guestlists/${id}/members`, { body: { text: paste } });
      if (r.errors.length) toast.error(`${r.added} toegevoegd. Regel ${r.errors[0].line}: ${r.errors[0].message}${r.errors.length > 1 ? ` (en ${r.errors.length - 1} meer)` : ""}`);
      else toast.success(`${r.added} relaties toegevoegd.`);
      setPaste(r.errors.length ? paste : "");
      await load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(memberId: string) {
    try {
      await api(`/api/tickets/guestlists/${id}/members?memberId=${memberId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast.error(errorText(e));
    }
  }
  async function issue() {
    if (!window.confirm(`Tickets uitgeven aan ${d?.members.length ?? 0} relaties van deze lijst?`)) return;
    setBusy(true);
    try {
      const { eventIds, typeId, zoneId, seasonId, validFrom, validUntil, locale } = issueBody(settings, []);
      const r = await api<{ pendingApproval: boolean; count: number; skipped: number; mailed: number }>(`/api/tickets/guestlists/${id}/issue`, { body: { issue: { typeId, zoneId, eventIds, seasonId, validFrom, validUntil, locale }, sendMail: mail } });
      toast.success(r.pendingApproval ? `${r.count} tickets wachten op goedkeuring.` : `${r.count} tickets uitgegeven${r.mailed ? `, ${r.mailed} gemaild` : ""}${r.skipped ? `, ${r.skipped} overgeslagen (hadden al een ticket)` : ""}.`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <p className="text-sm text-muted-foreground">Laden…</p>;
  return (
    <div className="space-y-5">
      <Link href="/tickets/gastenlijsten" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="h-4 w-4" /> Gastenlijsten
      </Link>
      <h1 className="text-2xl font-bold">{d.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Relaties ({d.members.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-0">
          <ul className="divide-y divide-border text-sm">
            {d.members.length === 0 && <li className="p-4 text-muted-foreground">Nog geen relaties.</li>}
            {d.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span>
                  {m.firstName} {m.lastName} <span className="text-xs text-muted-foreground">{[m.email, m.company, m.seats > 1 ? `${m.seats} tickets` : null].filter(Boolean).join(" · ")}</span>
                </span>
                <button aria-label="Verwijderen" onClick={() => void remove(m.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-t border-border p-4 text-sm">
            <p className="text-muted-foreground">Plak één relatie per regel: <code>voornaam achternaam; e-mail; bedrijf; aantal tickets</code>. Alleen de naam is verplicht. Bij meer dan één ticket krijgt de relatie de tickets gebundeld; de extra tickets staan op &quot;Gast van …&quot;.</p>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} className="w-full rounded-md border border-border bg-surface p-2 text-sm" placeholder={"Jan Smit; jan@bakkerij.nl; Bakkerij Smit; 4\nAnna de Vries; anna@example.nl"} />
            <Button size="sm" variant="outline" disabled={busy || !paste.trim()} onClick={() => void add()}>
              Toevoegen
            </Button>
          </div>
        </CardContent>
      </Card>

      {canIssue && d.members.length > 0 && (
        <>
          <IssueSettings value={settings} onChange={setSettings} />
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4 p-4 text-sm">
              {canResend && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} /> Direct per e-mail versturen
                </label>
              )}
              <Button disabled={busy || !settings.typeId} onClick={() => void issue()}>
                {busy ? "Bezig…" : "Tickets uitgeven aan de hele lijst"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
