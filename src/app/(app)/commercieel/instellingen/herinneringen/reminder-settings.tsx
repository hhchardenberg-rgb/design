"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate } from "@/lib/commercial/client";
import { DIGEST_FREQUENCIES, DIGEST_FREQUENCY_LABELS, type DigestFrequency } from "@/lib/commercial/digest-frequency";

interface Rule { tier: string; name: string; intervalDays: number | null }
interface Mute { id: string; userName: string; companyId: string; companyName: string; since: string }

export function ReminderSettingsForm({ canEdit, canReadRules }: { canEdit: boolean; canReadRules: boolean }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Herinneringen</h1>
        <p className="mt-1 text-muted-foreground">
          De herinneringsmail van Commerciële Zaken: hoe vaak die standaard komt, na hoeveel dagen zonder contact een sponsor gemeld wordt, en wie welke sponsor voor zichzelf op stil zette.
        </p>
      </div>
      <FrequencyCard canEdit={canEdit} />
      {canReadRules && <RulesCard canEdit={canEdit} />}
      {canEdit && <MutesCard />}
    </div>
  );
}

function FrequencyCard({ canEdit }: { canEdit: boolean }) {
  const toast = useStableToast();
  const [saved, setSaved] = useState<DigestFrequency | null>(null);
  const [value, setValue] = useState<DigestFrequency>("DAILY");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ defaultFrequency: DigestFrequency }>("/api/commercial/reminder-settings").then((r) => {
      if (!r.ok) { toast.error(r.error); return; }
      setSaved(r.data.defaultFrequency);
      setValue(r.data.defaultFrequency);
    });
  }, [toast]);

  async function save() {
    setBusy(true);
    const r = await api("/api/commercial/reminder-settings", "PUT", { defaultFrequency: value });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setSaved(value);
    toast.success("Opgeslagen.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Standaardfrequentie</CardTitle>
        <CardDescription>
          Geldt voor iedereen die in het eigen <Link className="text-hhc-orange-dark underline" href="/account/profiel">profiel</Link> op &ldquo;Standaard&rdquo; staat. Wie zelf een frequentie koos, houdt die.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {saved == null ? <p className="text-sm text-muted-foreground">Laden…</p> : (
          <>
            <fieldset className="space-y-2" disabled={!canEdit}>
              <legend className="sr-only">Standaardfrequentie</legend>
              {DIGEST_FREQUENCIES.map((f) => (
                <label key={f} className="flex items-start gap-3 text-sm">
                  <input type="radio" name="rs-frequency" className="mt-0.5 h-4 w-4 accent-hhc-orange" checked={value === f} onChange={() => setValue(f)} />
                  <span>
                    <span className="font-medium">{DIGEST_FREQUENCY_LABELS[f].label}</span>
                    <span className="block text-muted-foreground">{DIGEST_FREQUENCY_LABELS[f].hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {canEdit
              ? <Button onClick={save} disabled={busy || value === saved}>{busy ? "Opslaan…" : "Opslaan"}</Button>
              : <p className="text-xs text-muted-foreground">Alleen beheerders kunnen dit wijzigen.</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RulesCard({ canEdit }: { canEdit: boolean }) {
  const toast = useStableToast();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const r = await api<{ rules: Rule[] }>("/api/commercial/contact-rules");
    if (!r.ok) { toast.error(r.error); return; }
    setRules(r.data.rules);
    setDraft(Object.fromEntries(r.data.rules.map((x) => [x.tier, x.intervalDays == null ? "" : String(x.intervalDays)])));
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const next = Object.entries(draft).map(([tier, v]) => ({ tier, intervalDays: v.trim() === "" ? null : Number(v) }));
    if (next.some((r) => r.intervalDays != null && !Number.isInteger(r.intervalDays))) return toast.error("Vul een heel aantal dagen in, of laat het leeg.");
    const r = await api("/api/commercial/contact-rules", "PUT", { rules: next });
    if (!r.ok) return toast.error(r.error);
    toast.success("Termijnen opgeslagen.");
    await load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Termijn voor contactmomenten per sponsorvorm</CardTitle>
        <CardDescription>Aantal dagen zonder contactmoment waarna een sponsor gemeld wordt bij de eigenaar van het dossier. Leeg laten betekent geen herinnering voor die groep. Alleen sponsoren met status “Actief” tellen mee; een geplande afspraak in de toekomst telt als opvolging.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!rules ? <p className="text-sm text-muted-foreground">Laden…</p> : (
          <>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {rules.map((r) => (
                <div key={r.tier}>
                  <label htmlFor={`rule-${r.tier}`} className="text-sm font-medium">{r.name}</label>
                  <div className="flex items-center gap-1.5">
                    <Input id={`rule-${r.tier}`} type="number" inputMode="numeric" min={1} max={1095} placeholder="geen" disabled={!canEdit} value={draft[r.tier] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [r.tier]: e.target.value }))} />
                    <span className="text-sm text-muted-foreground">dagen</span>
                  </div>
                </div>
              ))}
            </div>
            {canEdit ? <Button onClick={save}>Opslaan</Button> : <p className="text-xs text-muted-foreground">Alleen beheerders kunnen de termijnen wijzigen.</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MutesCard() {
  const toast = useStableToast();
  const [mutes, setMutes] = useState<Mute[] | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ mutes: Mute[] }>("/api/commercial/reminder-mutes");
    if (r.ok) setMutes(r.data.mutes);
    else toast.error(r.error);
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function remove(m: Mute) {
    if (!confirm(`${m.companyName} weer aanzetten voor ${m.userName}?`)) return;
    const r = await api(`/api/commercial/reminder-mutes?id=${encodeURIComponent(m.id)}`, "DELETE");
    if (!r.ok) return toast.error(r.error);
    toast.success("Meldingen weer aangezet.");
    await load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sponsoren op stil</CardTitle>
        <CardDescription>Wie welke sponsor voor zichzelf op stil zette. Zij krijgen over die sponsor geen herinneringen meer over contactmomenten en opzegdata; toegewezen taken komen wel gewoon.</CardDescription>
      </CardHeader>
      <CardContent>
        {!mutes ? <p className="text-sm text-muted-foreground">Laden…</p> : mutes.length === 0 ? <p className="text-sm text-muted-foreground">Niemand heeft een sponsor op stil gezet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-1">Persoon</th><th className="py-1">Sponsor</th><th className="py-1">Sinds</th><th className="py-1" /></tr></thead>
              <tbody className="divide-y divide-border">
                {mutes.map((m) => (
                  <tr key={m.id}>
                    <td className="py-1.5">{m.userName}</td>
                    <td className="py-1.5"><Link className="font-medium underline" href={`/commercieel/sponsoren/${m.companyId}`}>{m.companyName}</Link></td>
                    <td className="py-1.5">{formatDate(m.since)}</td>
                    <td className="py-1.5 text-right"><Button variant="ghost" size="sm" onClick={() => remove(m)}>Weer aanzetten</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
