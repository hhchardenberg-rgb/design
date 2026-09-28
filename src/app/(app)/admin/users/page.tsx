"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ASSIGNABLE_ROLES, type AppRole } from "@/lib/roles";
import { generatePassword } from "@/lib/password";
import { cn } from "@/lib/utils";

function toggleRole(roles: AppRole[], role: AppRole): AppRole[] {
  return roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];
}

/** Compacte checkbox-rij voor de rollenset — nieuwe rollen komen hier automatisch bij (zie src/lib/roles.ts). */
function RoleCheckboxes({
  value,
  onChange,
  idPrefix,
}: {
  value: AppRole[];
  onChange: (roles: AppRole[]) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {ASSIGNABLE_ROLES.map((role) => {
        const id = `${idPrefix}-${role.value}`;
        return (
          <label key={role.value} htmlFor={id} className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input
              id={id}
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-hhc-orange"
              checked={value.includes(role.value)}
              onChange={() => onChange(toggleRole(value, role.value))}
            />
            {role.label}
          </label>
        );
      })}
    </div>
  );
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  roles: AppRole[];
  createdAt: string;
}

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<AppRole[]>(["HUB"]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [editEmailId, setEditEmailId] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState("");
  const [editNameId, setEditNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [editRolesId, setEditRolesId] = useState<string | null>(null);
  const [editRolesValue, setEditRolesValue] = useState<AppRole[]>([]);

  async function load() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(data.users ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, roles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Aanmaken mislukt.");
      setName("");
      setEmail("");
      setPassword("");
      setRoles(["HUB"]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er ging iets mis.");
    } finally {
      setCreating(false);
    }
  }

  async function submitRoles(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: editRolesValue }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Rollen wijzigen mislukt.");
      return;
    }
    setEditRolesId(null);
    await load();
  }

  async function submitResetPassword(id: string) {
    if (resetPassword.length < 8) {
      setError("Nieuw wachtwoord moet minimaal 8 tekens zijn.");
      return;
    }
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Wachtwoord wijzigen mislukt.");
      return;
    }
    setResetId(null);
    setResetPassword("");
  }

  async function submitEmail(id: string) {
    if (!editEmailValue.trim()) {
      setError("Geef een e-mailadres op.");
      return;
    }
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: editEmailValue.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "E-mailadres wijzigen mislukt.");
      return;
    }
    setEditEmailId(null);
    setEditEmailValue("");
    await load();
  }

  async function submitName(id: string) {
    if (!editNameValue.trim()) {
      setError("Geef een naam op.");
      return;
    }
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editNameValue.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Naam wijzigen mislukt.");
      return;
    }
    setEditNameId(null);
    setEditNameValue("");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Deze gebruiker verwijderen?")) return;
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Verwijderen mislukt.");
      return;
    }
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Gebruikers</h1>
        <p className="mt-1 text-muted-foreground">
          Beheer wie kan inloggen op de HHC Hardenberg Hub en welke onderdelen ze mogen gebruiken. Een gebruiker
          kan meerdere rollen tegelijk hebben.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={createUser} className="flex flex-col gap-3">
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
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Wachtwoord genereren"
                    onClick={() => {
                      setPassword(generatePassword());
                      setShowPassword(true);
                    }}
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title={showPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <div>
              <Label>Rollen</Label>
              <RoleCheckboxes value={roles} onChange={setRoles} idPrefix="new" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={creating} className="w-fit">
              {creating ? "Bezig..." : "Toevoegen"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {users.map((u) => (
          <Card key={u.id}>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {editNameId === u.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-8 w-48"
                        value={editNameValue}
                        onChange={(e) => setEditNameValue(e.target.value)}
                        autoFocus
                      />
                      <Button size="sm" onClick={() => submitName(u.id)}>
                        Opslaan
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditNameId(null);
                          setEditNameValue("");
                        }}
                      >
                        Annuleren
                      </Button>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 font-medium">
                      {u.name}
                      {u.id === session?.user?.id && <span className="text-xs font-normal text-muted-foreground">(jij)</span>}
                      <button
                        type="button"
                        className="text-xs font-normal text-hhc-orange-dark hover:underline"
                        onClick={() => {
                          setEditNameId(u.id);
                          setEditNameValue(u.name);
                        }}
                      >
                        wijzigen
                      </button>
                    </p>
                  )}
                  {editEmailId === u.id ? (
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="email"
                        className="h-8 w-56"
                        value={editEmailValue}
                        onChange={(e) => setEditEmailValue(e.target.value)}
                        autoFocus
                      />
                      <Button size="sm" onClick={() => submitEmail(u.id)}>
                        Opslaan
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditEmailId(null);
                          setEditEmailValue("");
                        }}
                      >
                        Annuleren
                      </Button>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      {u.email}
                      <button
                        type="button"
                        className="text-hhc-orange-dark hover:underline"
                        onClick={() => {
                          setEditEmailId(u.id);
                          setEditEmailValue(u.email);
                        }}
                      >
                        wijzigen
                      </button>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {resetId === u.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type={showResetPassword ? "text" : "password"}
                        placeholder="Nieuw wachtwoord"
                        className="h-8 w-36"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Wachtwoord genereren"
                        onClick={() => {
                          setResetPassword(generatePassword());
                          setShowResetPassword(true);
                        }}
                      >
                        <Sparkles className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title={showResetPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                        onClick={() => setShowResetPassword((v) => !v)}
                      >
                        {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" onClick={() => submitResetPassword(u.id)}>
                        Opslaan
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setResetId(null);
                          setResetPassword("");
                          setShowResetPassword(false);
                        }}
                      >
                        Annuleren
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setResetId(u.id)}>
                      Wachtwoord resetten
                    </Button>
                  )}

                  <Button size="sm" variant="ghost" onClick={() => remove(u.id)} disabled={u.id === session?.user?.id}>
                    Verwijderen
                  </Button>
                </div>
              </div>

              <div className={cn("flex flex-col gap-2 border-t border-border pt-3", editRolesId !== u.id && "sm:flex-row sm:items-center")}>
                {editRolesId === u.id ? (
                  <div className="flex flex-col gap-2">
                    <RoleCheckboxes value={editRolesValue} onChange={setEditRolesValue} idPrefix={u.id} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => submitRoles(u.id)}>
                        Opslaan
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditRolesId(null)}>
                        Annuleren
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {u.roles.length === 0 && <Badge variant="outline">Geen rollen</Badge>}
                      {ASSIGNABLE_ROLES.filter((r) => u.roles.includes(r.value)).map((r) => (
                        <Badge key={r.value} variant={r.value === "ADMIN" ? "primary" : "default"}>
                          {r.label}
                        </Badge>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="text-xs font-medium text-hhc-orange-dark hover:underline"
                      onClick={() => {
                        setEditRolesId(u.id);
                        setEditRolesValue(u.roles);
                      }}
                    >
                      rollen wijzigen
                    </button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
