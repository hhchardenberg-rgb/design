"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Lock, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { AccessTabs, groupRoles, summaryOf, type RoleView } from "@/components/access/access-parts";
import { ACTION_NAMES, Matrix } from "@/components/commercial/rights-parts";
import { findInconsistencies, isPermission, type Permission } from "@/lib/commercial/permissions";
import { ROLE_TEMPLATES } from "@/lib/commercial/role-templates";
import { LEVEL_LABELS, type SectionLevel } from "@/lib/access/model";
import { formatDayTime } from "@/lib/date-format";
import { cn } from "@/lib/utils";

interface Manager {
  full: boolean;
  hubAdmin: boolean;
  ticketingAdmin: boolean;
  commercialManage: boolean;
  userId: string;
}

interface AuditRow {
  id: string;
  at: string;
  actor: string | null;
  action: string;
  target: string | null;
  after: unknown;
  before: unknown;
}

interface Draft {
  id: string | null;
  isSystem: boolean;
  name: string;
  description: string;
  hubLevel: SectionLevel;
  ticketingLevel: SectionLevel;
  commercialOn: boolean;
  commercial: Set<Permission>;
}

const EMPTY: Draft = { id: null, isSystem: false, name: "", description: "", hubLevel: "NONE", ticketingLevel: "NONE", commercialOn: false, commercial: new Set() };

const SECTION_HINTS: Record<"hub" | "ticketing", Record<SectionLevel, string>> = {
  hub: { NONE: "Ziet Communicatie niet.", USER: "Designtool, agenda, nieuws, kennisbank en meer.", ADMIN: "Gebruiker, plus de inhoud beheren en anderen toegang geven." },
  ticketing: { NONE: "Ziet Ticketing niet.", USER: "Handleidingen en procedures van Ticketing.", ADMIN: "Gebruiker, plus de inhoud beheren en anderen toegang geven." },
};

function LevelChoice({
  label,
  section,
  value,
  onChange,
  allowed,
}: {
  label: string;
  section: "hub" | "ticketing";
  value: SectionLevel;
  onChange: (v: SectionLevel) => void;
  allowed: (v: SectionLevel) => boolean;
}) {
  return (
    <fieldset className="rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {(["NONE", "USER", "ADMIN"] as SectionLevel[]).map((lvl) => (
          <button
            key={lvl}
            type="button"
            role="radio"
            aria-checked={value === lvl}
            disabled={!allowed(lvl) && value !== lvl}
            onClick={() => onChange(lvl)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
              value === lvl ? "border-hhc-orange bg-primary/10 text-hhc-orange-dark" : "border-border hover:bg-surface-muted",
            )}
          >
            {LEVEL_LABELS[lvl]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{SECTION_HINTS[section][value]}</p>
    </fieldset>
  );
}

export default function RolesPage() {
  const toast = useToast();
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [manager, setManager] = useState<Manager | null>(null);
  const [grantable, setGrantable] = useState<Set<Permission> | undefined>(undefined);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/roles", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setRoles(data.roles ?? []);
    setManager(data.manager);
    setGrantable(data.grantable ? new Set((data.grantable as string[]).filter(isPermission)) : undefined);
    setAudit(data.audit ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function edit(r: RoleView | null, copy = false) {
    if (!r) {
      setDraft({ ...EMPTY, commercial: new Set() });
    } else {
      setDraft({
        id: copy ? null : r.id,
        isSystem: copy ? false : r.isSystem,
        name: copy ? `${r.name} (kopie)` : r.name,
        description: r.description ?? "",
        hubLevel: r.hubLevel,
        ticketingLevel: r.ticketingLevel,
        commercialOn: r.commercial !== null,
        commercial: new Set((r.commercial ?? []).filter(isPermission)),
      });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    const body = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      hubLevel: draft.hubLevel,
      ticketingLevel: draft.ticketingLevel,
      commercial: draft.commercialOn ? [...draft.commercial] : null,
    };
    const res = await fetch(draft.id ? `/api/admin/roles/${draft.id}` : "/api/admin/roles", {
      method: draft.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(draft.id ? "Rol opgeslagen. De wijziging geldt direct voor iedereen met deze rol." : "Rol aangemaakt. Wijs hem toe bij Gebruikers.");
      setDraft(null);
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(typeof data.error === "string" ? data.error : "Opslaan is niet gelukt.");
    }
  }

  async function remove(r: RoleView) {
    const who = r.userCount === 0 ? "Niemand heeft deze rol." : `${r.userCount} ${r.userCount === 1 ? "persoon verliest" : "personen verliezen"} daarmee wat deze rol gaf (andere rollen blijven).`;
    if (!confirm(`Rol “${r.name}” verwijderen? ${who}`)) return;
    const res = await fetch(`/api/admin/roles/${r.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Rol verwijderd.");
      if (draft?.id === r.id) setDraft(null);
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(typeof data.error === "string" ? data.error : "Verwijderen is niet gelukt.");
    }
  }

  const issues = draft?.commercialOn ? findInconsistencies(draft.commercial) : [];
  const canLevel = (section: "hub" | "ticketing") => (lvl: SectionLevel) =>
    !!manager && (manager.full || lvl === "NONE" || (lvl === "USER" && (section === "hub" ? manager.hubAdmin : manager.ticketingAdmin)));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold">Gebruikers en rechten</h1>
          <p className="mt-1 text-muted-foreground">
            Een rol is een herbruikbaar pakket rechten. Stel per onderdeel in wat de rol geeft en wijs hem daarna toe bij Gebruikers. Een wijziging aan een rol geldt meteen voor iedereen die hem heeft.
          </p>
        </div>
        <AccessTabs />
      </div>

      {draft ? (
        <Card>
          <CardHeader>
            <CardTitle>{draft.id ? `Rol bewerken: ${draft.name || "naamloos"}` : "Nieuwe rol"}</CardTitle>
            <CardDescription>
              {draft.isSystem ? "Hoofdadmin geeft altijd volledige toegang tot alles. Alleen de naam en omschrijving zijn aan te passen." : "Kies per onderdeel wat deze rol geeft. Wat je hier niet aanzet, geeft de rol niet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="role-name">Naam</Label>
                <Input id="role-name" className="mt-1" value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Bijvoorbeeld: Vrijwilliger communicatie" autoFocus />
              </div>
              <div>
                <Label htmlFor="role-description">Omschrijving (optioneel)</Label>
                <Input id="role-description" className="mt-1" value={draft.description} maxLength={300} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Voor wie is deze rol bedoeld?" />
              </div>
            </div>

            {!draft.isSystem && (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <LevelChoice label="Communicatie" section="hub" value={draft.hubLevel} onChange={(v) => setDraft({ ...draft, hubLevel: v })} allowed={canLevel("hub")} />
                  <LevelChoice label="Ticketing" section="ticketing" value={draft.ticketingLevel} onChange={(v) => setDraft({ ...draft, ticketingLevel: v })} allowed={canLevel("ticketing")} />
                </div>

                <fieldset className="rounded-md border border-border p-3">
                  <legend className="px-1 text-sm font-semibold">Commerciële Zaken</legend>
                  <div className="flex flex-wrap gap-2" role="radiogroup">
                    {[false, true].map((on) => (
                      <button
                        key={String(on)}
                        type="button"
                        role="radio"
                        aria-checked={draft.commercialOn === on}
                        disabled={on && !manager?.commercialManage && !draft.commercialOn}
                        onClick={() => setDraft({ ...draft, commercialOn: on })}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
                          draft.commercialOn === on ? "border-hhc-orange bg-primary/10 text-hhc-orange-dark" : "border-border hover:bg-surface-muted",
                        )}
                      >
                        {on ? "Toegang, met deze bevoegdheden" : "Geen toegang"}
                      </button>
                    ))}
                  </div>
                  {draft.commercialOn && (
                    <div className="mt-4 space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Label htmlFor="role-template" className="text-sm">Snel invullen vanuit een voorbeeld:</Label>
                        <select
                          id="role-template"
                          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                          value=""
                          onChange={(e) => {
                            const t = ROLE_TEMPLATES.find((x) => x.key === e.target.value);
                            if (t) setDraft({ ...draft, commercial: new Set(t.permissions.filter((p) => !grantable || grantable.has(p))) });
                          }}
                        >
                          <option value="">Kies een voorbeeld…</option>
                          {ROLE_TEMPLATES.map((t) => (
                            <option key={t.key} value={t.key}>{t.name}</option>
                          ))}
                        </select>
                        <span className="text-xs text-muted-foreground">Overschrijft de keuzes hieronder; daarna kun je nog aanpassen.</span>
                      </div>
                      <Matrix value={draft.commercial} onChange={(next) => setDraft({ ...draft, commercial: next })} disabled={false} grantable={grantable} />
                      {issues.length > 0 && (
                        <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
                          {issues.map((i) => <li key={i.permission}>{i.message}</li>)}
                        </ul>
                      )}
                    </div>
                  )}
                </fieldset>
              </>
            )}

            <div className="flex gap-2">
              <Button onClick={save} disabled={saving || !draft.name.trim() || issues.length > 0}>{saving ? "Opslaan…" : draft.id ? "Rol opslaan" : "Rol aanmaken"}</Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>Annuleren</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div>
          <Button onClick={() => edit(null)}>
            <Plus className="h-4 w-4" /> Nieuwe rol
          </Button>
        </div>
      )}

      {groupRoles(roles).map((g) => (
        <section key={g.label} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {g.roles.map((r) => (
              <Card key={r.id} className={cn(draft?.id === r.id && "border-hhc-orange")}>
                <CardContent className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold">
                        {r.name}
                        {r.isSystem && <Badge variant="primary">vast</Badge>}
                      </p>
                      {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Aantal gebruikers met deze rol">
                      <Users className="h-3.5 w-3.5" aria-hidden /> {r.userCount}
                    </span>
                  </div>
                  <ul className="flex flex-wrap gap-1.5">
                    {summaryOf(r).map((line) => (
                      <li key={line}><Badge variant="outline">{line}</Badge></li>
                    ))}
                  </ul>
                  <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
                    {r.manageable ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => edit(r)}><Pencil className="h-3.5 w-3.5" /> Bewerken</Button>
                        {!r.isSystem && <Button size="sm" variant="ghost" onClick={() => edit(r, true)}><Copy className="h-3.5 w-3.5" /> Kopiëren</Button>}
                        {!r.isSystem && <Button size="sm" variant="ghost" onClick={() => remove(r)}><Trash2 className="h-3.5 w-3.5" /> Verwijderen</Button>}
                      </>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" aria-hidden /> {r.manageReason}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Laatste wijzigingen aan rollen en toegang</summary>
        {audit.length === 0 ? (
          <p className="mt-2 text-muted-foreground">Nog geen wijzigingen.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {ACTION_NAMES[a.action] ?? a.action}
                  {a.target ? ` – ${a.target}` : ""}
                  {roleNameOf(a) ? ` – ${roleNameOf(a)}` : ""}
                </span>
                <span className="text-muted-foreground">{a.actor ?? "onbekend"} · {formatDayTime(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

/** Rolnaam uit een logregel, voor wijzigingen aan een rol zelf. */
function roleNameOf(a: AuditRow): string | null {
  if (!a.action.startsWith("access.role.")) return null;
  const src = (a.after ?? a.before) as { name?: unknown } | null;
  return typeof src?.name === "string" ? src.name : null;
}
