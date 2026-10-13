"use client";

import { Badge } from "@/components/ui/badge";
import { SPONSOR_TIERS, tierLabel } from "@/lib/commercial/sponsor-tiers";

/** Compacte aanduiding van de sponsorvorm in lijsten en dossiers. */
export function TierBadge({ tier }: { tier: string | null | undefined }) {
  const label = tierLabel(tier);
  if (!label) return <span className="text-muted-foreground">–</span>;
  return <Badge variant={tier === "HOOFD" || tier === "PLATINA" ? "primary" : "outline"}>{label}</Badge>;
}

/** Keuze van één of meer sponsorvormen als aanvinkbare chips. Met `allowNone` ook "Zonder vorm". */
export function TierFilter({ value, onChange, allowNone = false, label = "Sponsorvorm", disabled = false }: { value: string[]; onChange: (next: string[]) => void; allowNone?: boolean; label?: string; disabled?: boolean }) {
  const options = [...SPONSOR_TIERS.map((t) => ({ key: t.key as string, label: t.label })), ...(allowNone ? [{ key: "NONE", label: "Zonder vorm" }] : [])];
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.key);
          return (
            <button key={o.key} type="button" aria-pressed={on} onClick={() => toggle(o.key)} className={`rounded-full border px-3 py-1 text-sm disabled:opacity-60 ${on ? "border-primary bg-primary/10 text-hhc-orange-dark" : "border-border hover:bg-surface-muted"}`}>
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function TierSelect({ id, value, onChange, disabled }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select id={id} className="h-10 w-full rounded-md border border-border bg-surface px-2 text-sm disabled:opacity-60" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">Geen vorm gekozen</option>
      {SPONSOR_TIERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
    </select>
  );
}
