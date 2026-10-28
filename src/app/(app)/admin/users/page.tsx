"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Eye, EyeOff, Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ASSIGNABLE_ROLES, type AppRole } from "@/lib/roles";
import { generatePassword } from "@/lib/password";
import { cn } from "@/lib/utils";
import { CommercialAccessProvider, CommercialRolesPanel, UserCommercialPanel } from "@/components/commercial/commercial-access";

function toggleRole(roles: AppRole[], role: AppRole): AppRole[] {
  return roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];
}

/** Compacte checkbox-rij voor de rollenset — nieuwe rollen komen hier automatisch bij (zie src/lib/roles.ts). */
function RoleCheckboxes({
  value,
  onChange,
  idPrefix,
  options = ASSIGNABLE_ROLES,
}: {
  value: AppRole[];
  onChange: (roles: AppRole[]) => void;
  idPrefix: string;
  options?: typeof ASSIGNABLE_ROLES;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((role) => {
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

interface Manager {
  full: boolean;
  sections: ("hub" | "ticketing")[];
  commercial: boolean;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  roles: AppRole[];
  createdAt: string;
}

function welcomeNotice(result: "sent" | "skipped" | "failed", email: string): string {
  if (result === "sent") return `Welkomstmail verstuurd naar ${email}.`;
  if (result === "skipped") return "Welkomstmail niet verstuurd: dit is geen productieomgeving (een preview mailt nooit echte gebruikers).";
  return "Welkomstmail versturen is mislukt. Probeer het later opnieuw via de knop Welkomstmail.";
}

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [manager, setManager] = useState<Manager>({ full: true, sections: [], commercial: false });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<AppRole[]>(["HUB"]);
  const [sendWelcome, setSendWelcome] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [welcomeBusyId, setWelcomeBusyId] = useState<string | null>(null);
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
    if (data.manager) setManager(data.manager);
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, roles, sendWelcome }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Aanmaken mislukt.");
      setNotice(`Account voor ${data.user.name} aangemaakt.${data.welcome ? ` ${welcomeNotice(data.welcome, data.user.email)}` : ""}`);
      setName("");
      setEmail("");
      setPassword("");
      setRoles(["HUB"]);
      setSendWelcome(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er ging iets mis.");
    } finally {
      setCreating(false);
    }
  }

  async function resendWelcome(u: UserRow) {
    if (!confirm(`Welkomstmail met een nieuwe instellink sturen naar ${u.email}?`)) return;
    setError(null);
    setNotice(null);
    setWelcomeBusyId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/welcome`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Versturen mislukt.");
      setNotice(welcomeNotice(data.welcome, u.email));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er ging iets mis.");
    } finally {
      setWelcomeBusyId(null);
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

  // De hoofdadmin stelt alles in; een beheerder van een onderdeel alleen wie bij dat onderdeel hoort.
  const editableRoles = manager.full
    ? ASSIGNABLE_ROLES
    : ASSIGNABLE_ROLES.filter((r) => (manager.sections.includes("hub") && r.value === "HUB") || (manager.sections.includes("ticketing") && r.value === "TICKETING"));
  const shownRoles = manager.full
    ? ASSIGNABLE_ROLES
    : ASSIGNABLE_ROLES.filter((r) => (manager.sections.includes("hub") && (r.value === "HUB" || r.value === "HUB_ADMIN")) || (manager.sections.includes("ticketing") && (r.value === "TICKETING" || r.value === "TICKETING_ADMIN")));

  return (
    <CommercialAccessProvider>
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Gebruikers en rechten</h1>
        <p className="mt-1 text-muted-foreground">
          {manager.full
            ? "Beheer wie kan inloggen op de HHC Hardenberg Hub en welke onderdelen ze mogen gebruiken: Communicatie, Ticketing en Commerciële Zaken. Een gebruiker kan bij meerdere onderdelen horen en van meerdere onderdelen beheerder zijn. Een hoofdadmin ziet en beheert alles."
            : "Bepaal wie toegang heeft tot jouw onderdeel. Accounts en wachtwoorden beheert een hoofdadmin."}
        </p>
      </div>

      {manager.full && (
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
                <Label>Wachtwoord{sendWelcome && <span className="font-normal text-muted-foreground"> (optioneel)</span>}</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required={!sendWelcome}
                    placeholder={sendWelcome ? "Kiest de gebruiker zelf" : undefined}
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
            <div className="flex flex-col gap-1">
              <label htmlFor="new-welcome" className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  id="new-welcome"
                  type="checkbox"
                  className="h-4 w-4 rounded border-border accent-hhc-orange"
                  checked={sendWelcome}
                  onChange={(e) => setSendWelcome(e.target.checked)}
                />
                Welkomstmail sturen
              </label>
              <p className="text-xs text-muted-foreground">
                De gebruiker krijgt een mail met een link om zelf een wachtwoord te kiezen (7 dagen geldig) en uitleg over inloggen met tweestapsverificatie. Er staat nooit een wachtwoord in de mail.{" "}
                <a href="/api/admin/users/welcome-preview" target="_blank" rel="noreferrer" className="text-hhc-orange-dark hover:underline">
                  Voorbeeld bekijken
                </a>
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
            <Button type="submit" disabled={creating} className="w-fit">
              {creating ? "Bezig..." : "Toevoegen"}
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

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
                      {manager.full && (
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
                      )}
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
                      {manager.full && (
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
                      )}
                    </p>
                  )}
                </div>
                {manager.full && (
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

                  <Button size="sm" variant="outline" onClick={() => resendWelcome(u)} disabled={welcomeBusyId === u.id} title="Welkomstmail met instellink sturen">
                    <Mail className="h-4 w-4" />
                    {welcomeBusyId === u.id ? "Bezig..." : "Welkomstmail"}
                  </Button>

                  <Button size="sm" variant="ghost" onClick={() => remove(u.id)} disabled={u.id === session?.user?.id}>
                    Verwijderen
                  </Button>
                </div>
                )}
              </div>

              <div className={cn("flex flex-col gap-2 border-t border-border pt-3", editRolesId !== u.id && "sm:flex-row sm:items-center")}>
                {editRolesId === u.id ? (
                  <div className="flex flex-col gap-2">
                    <RoleCheckboxes value={editRolesValue} onChange={setEditRolesValue} idPrefix={u.id} options={editableRoles} />
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
                      {shownRoles.filter((r) => u.roles.includes(r.value)).map((r) => (
                        <Badge key={r.value} variant={r.value === "ADMIN" ? "primary" : "default"}>
                          {r.label}
                        </Badge>
                      ))}
                    </div>
                    {editableRoles.length > 0 && (
                      <button
                        type="button"
                        className="text-xs font-medium text-hhc-orange-dark hover:underline"
                        onClick={() => {
                          setEditRolesId(u.id);
                          setEditRolesValue(u.roles);
                        }}
                      >
                        {manager.full ? "rollen wijzigen" : "toegang wijzigen"}
                      </button>
                    )}
                  </>
                )}
              </div>
              <UserCommercialPanel userId={u.id} userName={u.name} isSelf={u.id === session?.user?.id} />
            </CardContent>
          </Card>
        ))}
      </div>

      <CommercialRolesPanel />
    </div>
    </CommercialAccessProvider>
  );
}
