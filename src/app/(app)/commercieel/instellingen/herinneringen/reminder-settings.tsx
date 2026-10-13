"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api } from "@/lib/commercial/client";
import { DIGEST_FREQUENCIES, DIGEST_FREQUENCY_LABELS, type DigestFrequency } from "@/lib/commercial/digest-frequency";

export function ReminderSettingsForm({ canEdit }: { canEdit: boolean }) {
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

  if (saved == null) return <p className="text-sm text-muted-foreground">Laden…</p>;

  async function save() {
    setBusy(true);
    const r = await api("/api/commercial/reminder-settings", "PUT", { defaultFrequency: value });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setSaved(value);
    toast.success("Opgeslagen.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Herinneringsmail</h1>
        <p className="mt-1 text-muted-foreground">
          Hoe vaak leden van Commerciële Zaken hun herinneringen krijgen: taken die verlopen zijn of eraan komen, naderende opzegdata en sponsoren die te lang niet gesproken zijn.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Standaardfrequentie</CardTitle>
          <CardDescription>
            Geldt voor iedereen die in het eigen <Link className="text-hhc-orange-dark underline" href="/account/profiel">profiel</Link> op &ldquo;Standaard&rdquo; staat. Wie zelf een frequentie koos, houdt die.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
            : <p className="text-xs text-muted-foreground">Alleen wie instellingen mag beheren kan dit wijzigen.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
