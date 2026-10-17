"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FieldDef } from "./field-control";

type Values = Record<string, unknown>;

interface Change {
  key: string;
  label: string;
  from: string;
  to: string;
}

function describe(value: unknown): string {
  if (value === undefined || value === null || value === "") return "leeg";
  if (typeof value === "boolean") return value ? "aan" : "uit";
  if (typeof value === "object") return "logo";
  return String(value);
}

function same(a: unknown, b: unknown): boolean {
  if (a && b && typeof a === "object" && typeof b === "object") {
    return (a as { assetUrl?: unknown }).assetUrl === (b as { assetUrl?: unknown }).assetUrl;
  }
  return a === b;
}

/**
 * Haalt de actuele wedstrijdgegevens op (tijd, score, locatie, logo's) en
 * laat zien wat er verandert voordat het in het ontwerp wordt overgenomen.
 */
export function MatchRefresh({
  matchId,
  templateVersionId,
  fields,
  formData,
  onApply,
}: {
  matchId: string;
  templateVersionId: string;
  fields: FieldDef[];
  formData: Values;
  onApply: (values: Values) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ values: Values; changes: Change[] } | null>(null);
  const [upToDate, setUpToDate] = useState(false);

  async function check() {
    setLoading(true);
    setError(null);
    setUpToDate(false);
    try {
      const res = await fetch(`/api/matches/${matchId}/prefill?versionId=${encodeURIComponent(templateVersionId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Ophalen is niet gelukt.");
      const values = data.values as Values;
      const changes = Object.entries(values)
        .filter(([key, value]) => !same(formData[key], value))
        .map(([key, value]) => ({
          key,
          label: fields.find((f) => f.key === key)?.label ?? key,
          from: describe(formData[key]),
          to: describe(value),
        }));
      if (changes.length === 0) setUpToDate(true);
      else setPending({ values, changes });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ophalen is niet gelukt.");
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (!pending) return;
    const picked: Values = {};
    for (const c of pending.changes) picked[c.key] = pending.values[c.key];
    onApply(picked);
    setPending(null);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
      {!pending && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={check} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Wedstrijdgegevens bijwerken
          </Button>
          {upToDate && <span className="text-xs text-muted-foreground">Alles is al actueel.</span>}
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      )}
      {pending && (
        <>
          <p className="font-medium">Deze gegevens zijn gewijzigd:</p>
          <ul className="flex flex-col gap-1 text-xs">
            {pending.changes.map((c) => (
              <li key={c.key}>
                <span className="font-medium">{c.label}:</span> <span className="text-muted-foreground line-through">{c.from}</span> wordt {c.to}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button size="sm" onClick={apply}>Overnemen</Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Annuleren</Button>
          </div>
        </>
      )}
    </div>
  );
}
