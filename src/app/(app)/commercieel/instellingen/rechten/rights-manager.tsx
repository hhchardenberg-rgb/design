"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import {
  ACTIONS,
  AREAS,
  AREA_KEYS,
  findInconsistencies,
  isPermission,
  levelFor,
  perm,
  permissionsForLevel,
  type Action,
  type AreaKey,
  type Level,
  type Permission,
} from "@/lib/commercial/permissions";

interface EffectiveRow {
  permission: Permission;
  allowed: boolean;
  source: string;
}
interface Member {
  userId: string;
  name: string;
  email: string;
  roleId: string | null;
  roleName: string | null;
  effective: EffectiveRow[];
}
interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
}
interface AuditRow {
  id: string;
  at: string;
  actor: string | null;
  action: string;
  targetUserId: string | null;
}
interface Overview {
  members: Member[];
  roles: Role[];
  audit: AuditRow[];
  grantable: Permission[];
  actorUserId: string;
}

const LEVEL_LABEL: Record<Level, string> = { none: "Geen toegang", read: "Alleen lezen", edit: "Lezen en bewerken" };
const GROUPS = ["Relaties", "Afspraken", "Financiën", "Communicatie", "Beheer"] as const;
const ACTION_NAMES: Record<string, string> = {
  "member.role": "Rol gewijzigd",
  "member.permissions": "Rechten gewijzigd",
  "membership.grant": "Toegang gegeven",
  "membership.revoke": "Toegang ingetrokken",
  "role.create": "Rol aangemaakt",
  "role.update": "Rol gewijzigd",
};

function toSet(rows: EffectiveRow[]): Set<Permission> {
  return new Set(rows.filter((r) => r.allowed).map((r) => r.permission));
}

/** Matrix van bevoegdheden per onderdeel, gebruikt voor zowel leden als rollen. */
function Matrix({
  value,
  onChange,
  disabled,
  grantable,
  sources,
}: {
  value: Set<Permission>;
  onChange: (next: Set<Permission>) => void;
  disabled: boolean;
  /** Welke bevoegdheden mogen worden toegevoegd; ontbreekt = alles (afbakening gebeurt server-side). */
  grantable?: Set<Permission>;
  sources?: Map<Permission, string>;
}) {
  const [open, setOpen] = useState<Set<AreaKey>>(new Set());
  const canAdd = (p: Permission) => !grantable || grantable.has(p) || value.has(p);

  function setLevel(area: AreaKey, level: Level) {
    const next = new Set(value);
    const current = levelFor(area, value);
    // Eerst alle basisrechten van dit onderdeel weghalen, daarna het gekozen niveau toepassen;
    // aanvullende (risicovolle) acties blijven behouden zolang het leesrecht blijft bestaan.
    for (const a of AREAS[area].actions) next.delete(perm(area, a));
    for (const p of permissionsForLevel(area, level)) if (canAdd(p)) next.add(p);
    if (level !== "none") for (const a of current.extras) if (canAdd(perm(area, a))) next.add(perm(area, a));
    onChange(next);
  }

  function toggle(p: Permission) {
    const next = new Set(value);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onChange(next);
  }

  return (
    <div className="space-y-5">
      {GROUPS.map((group) => (
        <div key={group}>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h4>
          <ul className="divide-y divide-border rounded-md border border-border">
            {AREA_KEYS.filter((k) => AREAS[k].group === group).map((key) => {
              const area = AREAS[key];
              const { level, extras } = levelFor(key, value);
              const extraActions = area.actions.filter((a) => !["read", "create", "update"].includes(a));
              const expanded = open.has(key);
              const hasEdit = area.actions.includes("create") || area.actions.includes("update");
              return (
                <li key={key} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {area.label}
                        {area.financial && <Badge className="ml-2" variant="outline">financieel</Badge>}
                        {area.confidential && <Badge className="ml-2" variant="outline">vertrouwelijk</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{area.description}</div>
                    </div>
                    <select
                      aria-label={`Niveau voor ${area.label}`}
                      className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                      disabled={disabled}
                      value={level}
                      onChange={(e) => setLevel(key, e.target.value as Level)}
                    >
                      <option value="none">{LEVEL_LABEL.none}</option>
                      <option value="read" disabled={!canAdd(perm(key, "read"))}>{LEVEL_LABEL.read}</option>
                      {hasEdit && <option value="edit" disabled={!permissionsForLevel(key, "edit").every(canAdd)}>{LEVEL_LABEL.edit}</option>}
                    </select>
                  </div>
                  {extraActions.length > 0 && level !== "none" && (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs font-medium text-hhc-orange-dark"
                        aria-expanded={expanded}
                        onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                      >
                        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        Aanvullende bevoegdheden{extras.length > 0 ? ` (${extras.length} aan)` : ""}
                      </button>
                      {expanded && (
                        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          {extraActions.map((a: Action) => {
                            const p = perm(key, a);
                            const id = `perm-${p}`;
                            return (
                              <label key={p} htmlFor={id} className="flex items-start gap-2 text-sm">
                                <input
                                  id={id}
                                  type="checkbox"
                                  className="mt-0.5 h-4 w-4 rounded border-border accent-hhc-orange"
                                  checked={value.has(p)}
                                  disabled={disabled || !canAdd(p)}
                                  onChange={() => toggle(p)}
                                />
                                <span>
                                  {ACTIONS[a].label}
                                  <span className="block text-xs text-muted-foreground">{ACTIONS[a].hint}</span>
                                  {sources?.get(p) && <span className="block text-xs text-muted-foreground">{sources.get(p)}</span>}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { error?: unknown };
  return { ok: false, error: typeof data.error === "string" ? data.error : "Opslaan is niet gelukt." };
}

export function RightsManager({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"members" | "roles" | "audit">("members");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<Permission>>(new Set());
  const [draftRole, setDraftRole] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<Set<Permission>>(new Set());
  const [roleName, setRoleName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/commercial/rights", { cache: "no-store" });
    if (!res.ok) {
      setLoadError("De gegevens konden niet worden geladen.");
      return;
    }
    setData((await res.json()) as Overview);
    setLoadError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grantable = useMemo(() => (data ? new Set(data.grantable) : new Set<Permission>()), [data]);
  const member = data?.members.find((m) => m.userId === selected) ?? null;
  const role = data?.roles.find((r) => r.id === selectedRole) ?? null;
  const isSelf = !!member && member.userId === data?.actorUserId;

  function pickMember(m: Member) {
    setSelected(m.userId);
    setDraft(toSet(m.effective));
    setDraftRole(m.roleId);
  }
  function pickRole(r: Role | null) {
    setSelectedRole(r?.id ?? "new");
    setRoleDraft(new Set((r?.permissions ?? []).filter(isPermission)));
    setRoleName(r?.name ?? "");
  }

  const memberIssues = findInconsistencies(draft);
  const roleIssues = findInconsistencies(roleDraft);

  async function saveMember() {
    if (!member) return;
    setSaving(true);
    // Bij een rolwissel is de gewenste set de rol zelf; anders de handmatig ingestelde matrix.
    const body: { roleId?: string | null; permissions?: Permission[] } = {};
    if (draftRole !== member.roleId) body.roleId = draftRole;
    body.permissions = [...draft];
    const r = await send(`/api/commercial/members/${member.userId}`, "PUT", body);
    setSaving(false);
    if (r.ok) {
      toast.success("Rechten opgeslagen.");
      await load();
    } else toast.error(r.error ?? "Opslaan is niet gelukt.");
  }

  async function saveRole() {
    setSaving(true);
    const body = { name: roleName, permissions: [...roleDraft] };
    const r = selectedRole === "new" ? await send("/api/commercial/roles", "POST", body) : await send(`/api/commercial/roles/${selectedRole}`, "PUT", body);
    setSaving(false);
    if (r.ok) {
      toast.success("Rol opgeslagen.");
      setSelectedRole(null);
      await load();
    } else toast.error(r.error ?? "Opslaan is niet gelukt.");
  }

  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Laden…</p>;

  const sources = new Map(member?.effective.map((e) => [e.permission, e.source]) ?? []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rechten</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bepaal per persoon wat die binnen Commerciële Zaken mag. {canManage ? "Je kunt alleen rechten toekennen die je zelf hebt." : "Je kunt deze pagina bekijken, maar niet wijzigen."}
        </p>
      </div>

      <div className="flex gap-1 border-b border-border" role="tablist">
        {([["members", "Personen"], ["roles", "Rollen"], ["audit", "Wijzigingen"]] as const).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm font-medium ${tab === k ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "members" && (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Personen met toegang</CardTitle>
              <CardDescription>Toegang tot de sectie geeft een platformbeheerder via Beheer.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.members.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog niemand heeft toegang.</p>
              ) : (
                <ul className="space-y-1">
                  {data.members.map((m) => (
                    <li key={m.userId}>
                      <button
                        onClick={() => pickMember(m)}
                        className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-muted ${selected === m.userId ? "bg-surface-muted font-semibold" : ""}`}
                      >
                        <div>{m.name}</div>
                        <div className="text-xs font-normal text-muted-foreground">{m.roleName ?? "Geen rol"}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {member ? (
            <Card>
              <CardHeader>
                <CardTitle>{member.name}</CardTitle>
                <CardDescription>{member.email}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {isSelf && <p className="rounded-md bg-surface-muted p-3 text-sm">Je kunt je eigen rechten niet aanpassen. Vraag een andere beheerder.</p>}
                <div>
                  <Label htmlFor="member-role">Rol (startpunt)</Label>
                  <select
                    id="member-role"
                    className="mt-1 h-10 w-full max-w-sm rounded-md border border-border bg-surface px-2 text-sm"
                    disabled={!canManage || isSelf}
                    value={draftRole ?? ""}
                    onChange={(e) => {
                      const id = e.target.value || null;
                      setDraftRole(id);
                      const r = data.roles.find((x) => x.id === id);
                      setDraft(new Set((r?.permissions ?? []).filter(isPermission)));
                    }}
                  >
                    <option value="">Geen rol</option>
                    {data.roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">Een andere rol kiezen zet de matrix terug naar die rol; daarna kun je uitzonderingen instellen.</p>
                </div>
                <Matrix value={draft} onChange={setDraft} disabled={!canManage || isSelf} grantable={grantable} sources={sources} />
                {memberIssues.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
                    {memberIssues.map((i) => <li key={i.permission}>{i.message}</li>)}
                  </ul>
                )}
                {canManage && !isSelf && (
                  <Button onClick={saveMember} disabled={saving || memberIssues.length > 0}>
                    {saving ? "Opslaan…" : "Opslaan"}
                  </Button>
                )}
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">Effectieve rechten en herkomst</summary>
                  <ul className="mt-2 divide-y divide-border">
                    {member.effective.filter((e) => e.allowed || e.source.startsWith("Individueel geblokkeerd") || e.source.startsWith("Vervalt")).map((e) => {
                      const { area, action } = { area: e.permission.split(":")[0] as AreaKey, action: e.permission.split(":")[1] as Action };
                      return (
                        <li key={e.permission} className="flex flex-wrap justify-between gap-2 py-1.5">
                          <span>{AREAS[area].label}: {ACTIONS[action].label}</span>
                          <span className="text-muted-foreground">{e.allowed ? "✓ " : "✗ "}{e.source}</span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">Kies links een persoon om de rechten te bekijken.</CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "roles" && (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Rollen</CardTitle>
              <CardDescription>Een rol is een herbruikbare verzameling bevoegdheden.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <ul className="space-y-1">
                {data.roles.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => pickRole(r)} className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-muted ${selectedRole === r.id ? "bg-surface-muted font-semibold" : ""}`}>
                      {r.name}
                    </button>
                  </li>
                ))}
              </ul>
              {canManage && <Button variant="outline" size="sm" onClick={() => pickRole(null)}>Nieuwe rol</Button>}
            </CardContent>
          </Card>
          {selectedRole ? (
            <Card>
              <CardHeader>
                <CardTitle>{selectedRole === "new" ? "Nieuwe rol" : role?.name}</CardTitle>
                {role?.description && <CardDescription>{role.description}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <Label htmlFor="role-name">Naam</Label>
                  <Input id="role-name" className="mt-1 max-w-sm" value={roleName} disabled={!canManage} onChange={(e) => setRoleName(e.target.value)} />
                </div>
                <Matrix value={roleDraft} onChange={setRoleDraft} disabled={!canManage} grantable={grantable} />
                {roleIssues.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
                    {roleIssues.map((i) => <li key={i.permission}>{i.message}</li>)}
                  </ul>
                )}
                {canManage && (
                  <Button onClick={saveRole} disabled={saving || roleIssues.length > 0 || !roleName.trim()}>
                    {saving ? "Opslaan…" : "Opslaan"}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">Een rolwijziging geldt direct voor iedereen met deze rol.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">Kies een rol of maak een nieuwe aan.</CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "audit" && (
        <Card>
          <CardHeader>
            <CardTitle>Laatste wijzigingen</CardTitle>
            <CardDescription>Wie wat wanneer heeft gewijzigd aan toegang en rechten (laatste 50).</CardDescription>
          </CardHeader>
          <CardContent>
            {data.audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen wijzigingen.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {data.audit.map((a) => {
                  const target = data.members.find((m) => m.userId === a.targetUserId)?.name;
                  return (
                    <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        {ACTION_NAMES[a.action] ?? a.action}
                        {target ? ` – ${target}` : ""}
                      </span>
                      <span className="text-muted-foreground">
                        {a.actor ?? "onbekend"} · {new Date(a.at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
