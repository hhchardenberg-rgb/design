"use client";

import { Checkbox, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ALL_TICKET_PERMISSIONS, TICKET_PERMISSIONS, TICKET_ROLE_TEMPLATES, withRequired, type TicketPermission } from "@/lib/tickets/permissions";

const GROUPS = ["Overzicht", "Tickets", "Scannen", "Inrichting", "Rapportage", "Beheer"] as const;

/**
 * Het blok "HHC Tickets" in de rolbewerker: geen toegang, of toegang met bevoegdheden.
 * Sjablonen voor de vaste rollen (ticketbeheerder, scanner, …). Alleen de hoofdadmin
 * kan HHC Tickets-toegang geven (de server dwingt dat ook af).
 */
export function TicketsRights({
  on,
  value,
  canGrant,
  onChange,
  issues,
}: {
  on: boolean;
  value: Set<TicketPermission>;
  canGrant: boolean;
  onChange: (on: boolean, next: Set<TicketPermission>) => void;
  issues: string[];
}) {
  const toggle = (p: TicketPermission, checked: boolean) => {
    const next = new Set(value);
    if (checked) for (const q of withRequired([...next, p])) next.add(q);
    else next.delete(p);
    onChange(true, next);
  };
  return (
    <fieldset className="rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-semibold">HHC Tickets</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {[false, true].map((v) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={on === v}
            disabled={!canGrant && v !== on}
            onClick={() => onChange(v, value)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
              on === v ? "border-hhc-orange bg-primary/10 text-hhc-orange-dark" : "border-border hover:bg-surface-muted",
            )}
          >
            {v ? "Toegang, met deze bevoegdheden" : "Geen toegang"}
          </button>
        ))}
      </div>
      {!canGrant && <p className="mt-2 text-xs text-muted-foreground">Toegang tot HHC Tickets geeft de hoofdadmin.</p>}
      {on && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="tickets-template" className="mb-0 text-sm">
              Snel invullen:
            </Label>
            <select
              id="tickets-template"
              className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
              value=""
              disabled={!canGrant}
              onChange={(e) => {
                const t = TICKET_ROLE_TEMPLATES.find((x) => x.key === e.target.value);
                if (t) onChange(true, new Set(t.permissions));
              }}
            >
              <option value="">Kies een rol…</option>
              {TICKET_ROLE_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">Superadmin is de rol Hoofdadmin: die mag automatisch alles.</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {GROUPS.map((g) => (
              <div key={g}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</p>
                <ul className="space-y-1">
                  {ALL_TICKET_PERMISSIONS.filter((p) => TICKET_PERMISSIONS[p].group === g).map((p) => (
                    <li key={p}>
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox className="mt-0.5" checked={value.has(p)} disabled={!canGrant} onChange={(e) => toggle(p, e.target.checked)} />
                        <span>
                          {TICKET_PERMISSIONS[p].label}
                          {"sensitive" in TICKET_PERMISSIONS[p] && <span className="ml-1 text-xs text-hhc-orange-dark">gevoelig</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {issues.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
              {issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </fieldset>
  );
}
