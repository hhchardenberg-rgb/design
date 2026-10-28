"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { findInconsistencies, type Permission } from "@/lib/commercial/permissions";
import { Matrix, send, toSet, type Member, type Overview } from "@/components/commercial/rights-parts";
import { ACTIONS, AREAS, type Action, type AreaKey } from "@/lib/commercial/permissions";

interface State {
  /** Volledig rechtenoverzicht van Commerciële Zaken; null als de beheerder daar geen inzage in heeft. */
  rights: Overview | null;
  canManage: boolean;
  reload: () => Promise<void>;
}

const Ctx = createContext<State | null>(null);
const useAccess = () => useContext(Ctx);

/** Laadt de rechten van Commerciële Zaken één keer voor het hele gebruikersscherm. */
export function CommercialAccessProvider({ children, version }: { children: React.ReactNode; version?: number }) {
  const [state, setState] = useState<Omit<State, "reload">>({ rights: null, canManage: false });

  const reload = useCallback(async () => {
    const res = await fetch("/api/commercial/rights", { cache: "no-store" });
    const rights = res.ok ? ((await res.json()) as Overview) : null;
    // Wijzigen mag alleen met rechtenbeheer; dat blijkt uit de bevoegdheden die de beheerder kan toekennen.
    setState({ rights, canManage: !!rights && rights.grantable.includes("rights:manage_rights") });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, version]);

  const value = useMemo(() => ({ ...state, reload }), [state, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Persoonlijke uitzonderingen en bereik in Commerciële Zaken. De basis komt uit de rollen van
 * deze persoon; hier stel je alleen in wat voor deze ene persoon anders moet.
 */
export function UserCommercialPanel({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const ctx = useAccess();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Set<Permission>>(new Set());
  const [draftScopes, setDraftScopes] = useState<Member["scopes"]>({ companies: "ALL", tasks: "ALL" });

  const rights = ctx?.rights;
  const member = rights?.members.find((m) => m.userId === userId) ?? null;
  if (!ctx || !rights || !member) return null;
  const grantable = new Set(rights.grantable);
  const issues = findInconsistencies(draft);
  const readOnly = !ctx.canManage || isSelf;
  const overrides = member.effective.filter((e) => e.source.startsWith("Individueel")).length;

  function begin() {
    setDraft(toSet(member!.effective));
    setDraftScopes(member!.scopes);
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    const body: { permissions: Permission[]; scopes?: Member["scopes"] } = { permissions: [...draft] };
    if (draftScopes.companies !== member!.scopes.companies || draftScopes.tasks !== member!.scopes.tasks) body.scopes = draftScopes;
    const r = await send(`/api/commercial/members/${userId}`, "PUT", body);
    setBusy(false);
    if (r.ok) {
      toast.success("Uitzonderingen opgeslagen.");
      await ctx!.reload();
    } else toast.error(r.error ?? "Opslaan is niet gelukt.");
  }

  const sources = new Map(member.effective.map((e) => [e.permission, e.source]));

  return (
    <div className="border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Briefcase className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">Commerciële Zaken</span>
        <span className="text-xs text-muted-foreground">
          {overrides === 0 ? "precies volgens de rollen" : `${overrides} persoonlijke uitzondering${overrides === 1 ? "" : "en"}`}
          {member.scopes.companies !== "ALL" || member.scopes.tasks !== "ALL" ? " · beperkt bereik" : ""}
        </span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => (open ? setOpen(false) : begin())} aria-expanded={open}>
          {open ? "Sluiten" : readOnly ? "Bekijken" : "Uitzonderingen en bereik"}
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-5">
          {isSelf && <p className="rounded-md bg-surface-muted p-3 text-sm">Je kunt je eigen rechten niet aanpassen. Vraag een andere beheerder.</p>}
          {!ctx.canManage && !isSelf && <p className="rounded-md bg-surface-muted p-3 text-sm">Je kunt deze rechten bekijken, maar niet wijzigen.</p>}
          <p className="text-sm text-muted-foreground">
            De basis komt uit de rollen ({member.roleName ?? "geen"}). Zet hieronder alleen iets aan of uit als het voor deze persoon anders moet dan de rol; dat wordt als uitzondering bewaard.
          </p>
          <div className="rounded-md border border-border p-3">
            <h4 className="text-sm font-semibold">Bereik: welke dossiers en taken ziet deze persoon?</h4>
            <p className="mb-2 text-xs text-muted-foreground">“Alleen eigen” betekent: alleen dossiers waarvan deze persoon de verantwoordelijke is.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {([["companies", "Sponsordossiers"], ["tasks", "Taken"]] as const).map(([area, label]) => (
                <div key={area}>
                  <Label htmlFor={`scope-${userId}-${area}`}>{label}</Label>
                  <select id={`scope-${userId}-${area}`} className="h-10 w-full rounded-md border border-border bg-surface px-2 text-sm" disabled={readOnly}
                    value={draftScopes[area]} onChange={(e) => setDraftScopes((s) => ({ ...s, [area]: e.target.value as "OWN" | "TEAM" | "ALL" }))}>
                    <option value="OWN">Alleen eigen</option>
                    <option value="TEAM">Eigen team</option>
                    <option value="ALL">Alles</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
          <Matrix value={draft} onChange={setDraft} disabled={readOnly} grantable={grantable} sources={sources} />
          {issues.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
              {issues.map((i) => <li key={i.permission}>{i.message}</li>)}
            </ul>
          )}
          {!readOnly && <Button onClick={save} disabled={busy || issues.length > 0}>{busy ? "Opslaan…" : "Opslaan"}</Button>}
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Effectieve rechten en herkomst</summary>
            <ul className="mt-2 divide-y divide-border">
              {member.effective.filter((e) => e.allowed || e.source.startsWith("Individueel geblokkeerd") || e.source.startsWith("Vervalt")).map((e) => {
                const area = e.permission.split(":")[0] as AreaKey;
                const action = e.permission.split(":")[1] as Action;
                return (
                  <li key={e.permission} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span>{AREAS[area].label}: {ACTIONS[action].label}</span>
                    <span className="text-muted-foreground">{e.allowed ? "✓ " : "✗ "}{e.source}</span>
                  </li>
                );
              })}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
