"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Eye, EyeOff, Plus, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { generatePassword } from "@/lib/password";
import { CommercialAccessProvider, UserCommercialPanel } from "@/components/commercial/commercial-access";
import { AccessTabs, RoleBadge, RolePicker, type RoleView } from "@/components/access/access-parts";

interface Manager {
  full: boolean;
  sections: ("hub" | "ticketing")[];
  commercial: boolean;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  roleIds: string[];
  createdAt: string;
}

async function call(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { error?: unknown };
  return typeof data.error === "string" ? data.error : "Er ging iets mis.";
}

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [manager, setManager] = useState<Manager>({ full: false, sections: [], commercial: false });
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRoles, setNewRoles] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [editAccountId, setEditAccountId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRolesId, setEditRolesId] = useState<string | null>(null);
  const [editRolesValue, setEditRolesValue] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    const data = await res.json();
    setUsers(data.users ?? []);
    setRoles(data.roles ?? []);
    if (data.manager) setManager(data.manager);
    setLoaded(true);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) && (!roleFilter || (roleFilter === "none" ? u.roleIds.length === 0 : u.roleIds.includes(roleFilter))));
  }, [users, query, roleFilter]);

  async function run(fn: () => Promise<string | null>, after?: () => void) {
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    after?.();
    await load();
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const err = await call("/api/admin/users", "POST", { name, email, password, roleIds: newRoles });
    setCreating(false);
    if (err) {
      setError(err);
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    setNewRoles([]);
    setShowCreate(false);
    await load();
  }

  const isSelf = (id: string) => id === session?.user?.id;

  return (
    <CommercialAccessProvider version={version}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold">Gebruikers en rechten</h1>
            <p className="mt-1 text-muted-foreground">
              Iedereen krijgt toegang via rollen. Een rol bepaalt per onderdeel (Communicatie, Ticketing, Commerciële Zaken) wat iemand mag; met meerdere rollen tellen de rechten op.
              {!manager.full && " Je kunt alleen rollen toewijzen die binnen jouw eigen beheer vallen."}
            </p>
          </div>
          <AccessTabs />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="pl-9" placeholder="Zoek op naam of e-mailadres" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Zoeken" />
          </div>
          <select aria-label="Filter op rol" className="h-10 rounded-md border border-border bg-surface px-2 text-sm" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">Alle rollen</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name} ({r.userCount})</option>
            ))}
            <option value="none">Zonder rol</option>
          </select>
          {manager.full && (
            <Button onClick={() => setShowCreate((v) => !v)} variant={showCreate ? "outline" : "primary"}>
              <Plus className="h-4 w-4" /> Nieuwe gebruiker
            </Button>
          )}
        </div>

        {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        {manager.full && showCreate && (
          <Card>
            <CardContent className="p-6">
              <form onSubmit={createUser} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Naam</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div>
                    <Label>E-mailadres</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div>
                    <Label>Wachtwoord</Label>
                    <div className="flex items-center gap-1">
                      <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
                      <Button type="button" size="icon" variant="ghost" title="Wachtwoord genereren" onClick={() => { setPassword(generatePassword()); setShowPassword(true); }}>
                        <Sparkles className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" title={showPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"} onClick={() => setShowPassword((v) => !v)}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Rollen</Label>
                  <p className="mb-2 text-xs text-muted-foreground">Zonder rol kan iemand wel inloggen, maar nergens bij.</p>
                  <RolePicker roles={roles} value={newRoles} onChange={setNewRoles} idPrefix="new" />
                </div>
                <Button type="submit" disabled={creating} className="w-fit">{creating ? "Bezig..." : "Gebruiker toevoegen"}</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {loaded && shown.length === 0 && <p className="text-sm text-muted-foreground">Geen gebruikers gevonden.</p>}

        <div className="flex flex-col gap-2">
          {shown.map((u) => {
            const assigned = u.roleIds.map((id) => roleById.get(id)).filter((r): r is RoleView => !!r);
            const canEditRoles = manager.full || (!isSelf(u.id) && !u.isAdmin && roles.some((r) => r.manageable));
            return (
              <Card key={u.id}>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    {editAccountId === u.id ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input className="h-8 sm:w-48" value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Naam" autoFocus />
                        <Input type="email" className="h-8 sm:w-60" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} aria-label="E-mailadres" />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={busy} onClick={() => run(() => call(`/api/admin/users/${u.id}`, "PATCH", { name: editName.trim(), email: editEmail.trim() }), () => setEditAccountId(null))}>Opslaan</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditAccountId(null)}>Annuleren</Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="flex items-center gap-2 font-medium">
                          {u.name}
                          {isSelf(u.id) && <span className="text-xs font-normal text-muted-foreground">(jij)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    )}
                    {manager.full && editAccountId !== u.id && (
                      <div className="flex flex-wrap items-center gap-2">
                        {resetId === u.id ? (
                          <div className="flex items-center gap-1">
                            <Input type={showResetPassword ? "text" : "password"} placeholder="Nieuw wachtwoord" className="h-8 w-36" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
                            <Button type="button" size="icon" variant="ghost" title="Wachtwoord genereren" onClick={() => { setResetPassword(generatePassword()); setShowResetPassword(true); }}>
                              <Sparkles className="h-4 w-4" />
                            </Button>
                            <Button type="button" size="icon" variant="ghost" title={showResetPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"} onClick={() => setShowResetPassword((v) => !v)}>
                              {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                resetPassword.length < 8
                                  ? setError("Nieuw wachtwoord moet minimaal 8 tekens zijn.")
                                  : run(() => call(`/api/admin/users/${u.id}`, "PATCH", { password: resetPassword }), () => { setResetId(null); setResetPassword(""); })
                              }
                            >
                              Opslaan
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setResetId(null); setResetPassword(""); setShowResetPassword(false); }}>Annuleren</Button>
                          </div>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => { setEditAccountId(u.id); setEditName(u.name); setEditEmail(u.email); }}>Gegevens wijzigen</Button>
                            <Button size="sm" variant="outline" onClick={() => setResetId(u.id)}>Wachtwoord resetten</Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isSelf(u.id) || busy}
                          onClick={() => confirm(`${u.name} verwijderen? Dit kan niet ongedaan worden gemaakt.`) && run(() => call(`/api/admin/users/${u.id}`, "DELETE"))}
                        >
                          Verwijderen
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border pt-3">
                    {editRolesId === u.id ? (
                      <div className="flex flex-col gap-3">
                        <RolePicker roles={roles} value={editRolesValue} onChange={setEditRolesValue} idPrefix={u.id} />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={busy} onClick={() => run(() => call(`/api/admin/users/${u.id}`, "PATCH", { roleIds: editRolesValue }), () => setEditRolesId(null))}>
                            {busy ? "Opslaan…" : "Rollen opslaan"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditRolesId(null)}>Annuleren</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {assigned.length === 0 && <Badge variant="outline">Geen rollen: nergens toegang</Badge>}
                        {assigned.map((r) => <RoleBadge key={r.id} role={r} />)}
                        {canEditRoles && (
                          <button
                            type="button"
                            className="ml-1 text-xs font-medium text-hhc-orange-dark hover:underline"
                            onClick={() => { setEditRolesId(u.id); setEditRolesValue(u.roleIds); }}
                          >
                            rollen wijzigen
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {!u.isAdmin && <UserCommercialPanel userId={u.id} isSelf={isSelf(u.id)} />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </CommercialAccessProvider>
  );
}
