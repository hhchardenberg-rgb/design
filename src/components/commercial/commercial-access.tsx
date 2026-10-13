"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { findInconsistencies, isPermission, type Permission } from "@/lib/commercial/permissions";
import { ACTION_NAMES, Matrix, send, toSet, type Member, type Overview, type Role } from "@/components/commercial/rights-parts";
import { ACTIONS, AREAS, type Action, type AreaKey } from "@/lib/commercial/permissions";

interface AccessUser { id: string; hasAccess: boolean; roleId: string | null; isAdmin: boolean }
interface AccessRole { id: string; key: string; name: string }

interface State {
  /** Commerciële Zaken staat aan (anders is hier niets te beheren). */
  enabled: boolean;
  loaded: boolean;
  users: Map<string, AccessUser>;
  roles: AccessRole[];
  /** Volledig rechtenoverzicht; null als de ingelogde beheerder zelf geen rechtenbeheer in de sectie heeft. */
  rights: Overview | null;
  canManage: boolean;
  reload: () => Promise<void>;
}

const Ctx = createContext<State | null>(null);
const useAccess = () => useContext(Ctx);

/** Laadt toegang en rechten van Commerciële Zaken één keer voor het hele gebruikersscherm. */
export function CommercialAccessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<State, "reload">>({ enabled: false, loaded: false, users: new Map(), roles: [], rights: null, canManage: false });

  const reload = useCallback(async () => {
    const accessRes = await fetch("/api/admin/commercial/access", { cache: "no-store" });
    if (!accessRes.ok) {
      setState((s) => ({ ...s, enabled: false, loaded: true }));
      return;
    }
    const access = (await accessRes.json()) as { users: (AccessUser & { name: string })[]; roles: AccessRole[] };
    const rightsRes = await fetch("/api/commercial/rights", { cache: "no-store" });
    const rights = rightsRes.ok ? ((await rightsRes.json()) as Overview) : null;
    // Wijzigen mag alleen met rechtenbeheer; dat blijkt uit de bevoegdheden die de beheerder kan toekennen.
    setState({
      enabled: true,
      loaded: true,
      users: new Map(access.users.map((u) => [u.id, u])),
      roles: access.roles,
      rights,
      canManage: !!rights && rights.grantable.includes("rights:manage_rights"),
    });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(() => ({ ...state, reload }), [state, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Het rechtenblok in de kaart van één gebruiker: toegang geven of intrekken, rol, bereik en bevoegdheden. */
export function UserCommercialPanel({ userId, userName, isSelf }: { userId: string; userName: string; isSelf: boolean }) {
  const ctx = useAccess();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [roleFor, setRoleFor] = useState("");
  const [draft, setDraft] = useState<Set<Permission>>(new Set());
  const [draftRole, setDraftRole] = useState<string | null>(null);
  const [draftScopes, setDraftScopes] = useState<Member["scopes"]>({ companies: "ALL", tasks: "ALL" });

  if (!ctx || !ctx.loaded || !ctx.enabled) return null;
  const user = ctx.users.get(userId);
  if (!user) return null;
  if (user.isAdmin) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Briefcase className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">Commerciële Zaken</span>
        <Badge variant="success">Volledige toegang</Badge>
        <span className="text-xs text-muted-foreground">Een hoofdadmin ziet en beheert automatisch alles.</span>
      </div>
    );
  }
  const member = ctx.rights?.members.find((m) => m.userId === userId) ?? null;
  const rights = ctx.rights;
  const grantable = new Set(rights?.grantable ?? []);
  const roleName = member?.roleName ?? ctx.roles.find((r) => r.id === user.roleId)?.name ?? null;
  const issues = findInconsistencies(draft);
  const readOnly = !ctx.canManage || isSelf;

  async function access(method: "POST" | "DELETE") {
    if (method === "DELETE" && !confirm(`Toegang tot Commerciële Zaken van ${userName} intrekken?`)) return;
    setBusy(true);
    const r =
      method === "POST"
        ? await send("/api/admin/commercial/access", "POST", { userId, roleId: roleFor || null })
        : await send(`/api/admin/commercial/access?userId=${encodeURIComponent(userId)}`, "DELETE");
    setBusy(false);
    if (r.ok) {
      toast.success(method === "POST" ? "Toegang gegeven." : "Toegang ingetrokken.");
      setOpen(false);
      await ctx!.reload();
    } else toast.error(r.error ?? "Dit is niet gelukt.");
  }

  function begin() {
    if (member) {
      setDraft(toSet(member.effective));
      setDraftRole(member.roleId);
      setDraftScopes(member.scopes);
    }
    setOpen(true);
  }

  async function save() {
    if (!member) return;
    setBusy(true);
    const body: { roleId?: string | null; permissions: Permission[]; scopes?: Member["scopes"] } = { permissions: [...draft] };
    if (draftScopes.companies !== member.scopes.companies || draftScopes.tasks !== member.scopes.tasks) body.scopes = draftScopes;
    if (draftRole !== member.roleId) body.roleId = draftRole;
    const r = await send(`/api/commercial/members/${userId}`, "PUT", body);
    setBusy(false);
    if (r.ok) {
      toast.success("Rechten opgeslagen.");
      await ctx!.reload();
    } else toast.error(r.error ?? "Opslaan is niet gelukt.");
  }

  const sources = new Map(member?.effective.map((e) => [e.permission, e.source]) ?? []);

  return (
    <div className="border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Briefcase className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">Commerciële Zaken</span>
        {user.hasAccess ? <Badge variant="success">Heeft toegang</Badge> : <Badge variant="outline">Geen toegang</Badge>}
        {user.hasAccess && <span className="text-xs text-muted-foreground">{roleName ?? "Geen rol"}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!user.hasAccess && (
            <>
              <select aria-label={`Startrol voor ${userName}`} className="h-8 rounded-md border border-border bg-surface px-2 text-xs" value={roleFor} onChange={(e) => setRoleFor(e.target.value)}>
                <option value="">Geen rol (nog geen bevoegdheden)</option>
                {ctx.roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <Button size="sm" disabled={busy} onClick={() => access("POST")}>Toegang geven</Button>
            </>
          )}
          {user.hasAccess && (
            <>
              {rights && member && (
                <Button size="sm" variant="outline" onClick={() => (open ? setOpen(false) : begin())} aria-expanded={open}>
                  {open ? "Sluiten" : ctx.canManage && !isSelf ? "Rechten instellen" : "Rechten bekijken"}
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => access("DELETE")}>Toegang intrekken</Button>
            </>
          )}
        </div>
      </div>

      {user.hasAccess && !rights && (
        <p className="mt-2 text-xs text-muted-foreground">
          Je kunt hier toegang geven en intrekken. Om rechten binnen de sectie in te stellen heb je zelf een rol met rechtenbeheer in Commerciële Zaken nodig (bijvoorbeeld “Beheerder Commerciële Zaken”).
        </p>
      )}

      {open && member && rights && (
        <div className="mt-4 space-y-5">
          {isSelf && <p className="rounded-md bg-surface-muted p-3 text-sm">Je kunt je eigen rechten niet aanpassen. Vraag een andere beheerder.</p>}
          {!ctx.canManage && !isSelf && <p className="rounded-md bg-surface-muted p-3 text-sm">Je kunt deze rechten bekijken, maar niet wijzigen.</p>}
          <div>
            <Label htmlFor={`role-${userId}`}>Rol (startpunt)</Label>
            <select
              id={`role-${userId}`}
              className="mt-1 h-10 w-full max-w-sm rounded-md border border-border bg-surface px-2 text-sm"
              disabled={readOnly}
              value={draftRole ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setDraftRole(id);
                const r = rights.roles.find((x) => x.id === id);
                setDraft(new Set((r?.permissions ?? []).filter(isPermission)));
              }}
            >
              <option value="">Geen rol</option>
              {rights.roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">Een andere rol kiezen zet de matrix terug naar die rol; daarna kun je uitzonderingen instellen.</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <h4 className="text-sm font-semibold">Bereik: welke dossiers en taken ziet deze persoon?</h4>
            <p className="mb-2 text-xs text-muted-foreground">Dit wordt server-side afgedwongen. “Alleen eigen” betekent: alleen dossiers waarvan deze persoon de verantwoordelijke is.</p>
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
          {!readOnly && <Button onClick={save} disabled={busy || issues.length > 0}>{busy ? "Opslaan…" : "Rechten opslaan"}</Button>}
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

/** Rollen van Commerciële Zaken en de laatste rechtenwijzigingen, onderaan het gebruikersscherm. */
export function CommercialRolesPanel() {
  const ctx = useAccess();
  const toast = useToast();
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<Set<Permission>>(new Set());
  const [roleName, setRoleName] = useState("");
  const [saving, setSaving] = useState(false);

  if (!ctx || !ctx.loaded || !ctx.enabled) return null;
  const rights = ctx.rights;
  const role: Role | undefined = rights?.roles.find((r) => r.id === selectedRole);
  const grantable = new Set(rights?.grantable ?? []);
  const issues = findInconsistencies(roleDraft);

  function pick(r: Role | null) {
    setSelectedRole(r?.id ?? "new");
    setRoleDraft(new Set((r?.permissions ?? []).filter(isPermission)));
    setRoleName(r?.name ?? "");
  }

  async function save() {
    setSaving(true);
    const body = { name: roleName, permissions: [...roleDraft] };
    const r = selectedRole === "new" ? await send("/api/commercial/roles", "POST", body) : await send(`/api/commercial/roles/${selectedRole}`, "PUT", body);
    setSaving(false);
    if (r.ok) {
      toast.success("Rol opgeslagen.");
      setSelectedRole(null);
      await ctx!.reload();
    } else toast.error(r.error ?? "Opslaan is niet gelukt.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rollen Commerciële Zaken</CardTitle>
        <CardDescription>
          Een rol is een herbruikbare verzameling bevoegdheden. Je kent ze hierboven per gebruiker toe. Een rolwijziging geldt direct voor iedereen met die rol.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!rights ? (
          <p className="text-sm text-muted-foreground">Rollen beheren vraagt een rol met rechtenbeheer in Commerciële Zaken (bijvoorbeeld “Beheerder Commerciële Zaken”).</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {rights.roles.map((r) => (
                <Button key={r.id} size="sm" variant={selectedRole === r.id ? "primary" : "outline"} onClick={() => pick(r)}>{r.name}</Button>
              ))}
              {ctx.canManage && <Button size="sm" variant="ghost" onClick={() => pick(null)}>+ Nieuwe rol</Button>}
            </div>
            {selectedRole && (
              <div className="space-y-5 rounded-md border border-border p-4">
                {role?.description && <p className="text-sm text-muted-foreground">{role.description}</p>}
                <div>
                  <Label htmlFor="role-name">Naam</Label>
                  <Input id="role-name" className="mt-1 max-w-sm" value={roleName} disabled={!ctx.canManage} onChange={(e) => setRoleName(e.target.value)} />
                </div>
                <Matrix value={roleDraft} onChange={setRoleDraft} disabled={!ctx.canManage} grantable={grantable} />
                {issues.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
                    {issues.map((i) => <li key={i.permission}>{i.message}</li>)}
                  </ul>
                )}
                {ctx.canManage && <Button onClick={save} disabled={saving || issues.length > 0 || !roleName.trim()}>{saving ? "Opslaan…" : "Rol opslaan"}</Button>}
              </div>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Laatste wijzigingen aan toegang en rechten</summary>
              {rights.audit.length === 0 ? (
                <p className="mt-2 text-muted-foreground">Nog geen wijzigingen.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border">
                  {rights.audit.map((a) => {
                    const target = rights.members.find((m) => m.userId === a.targetUserId)?.name;
                    return (
                      <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <span>{ACTION_NAMES[a.action] ?? a.action}{target ? ` – ${target}` : ""}</span>
                        <span className="text-muted-foreground">{a.actor ?? "onbekend"} · {new Date(a.at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
