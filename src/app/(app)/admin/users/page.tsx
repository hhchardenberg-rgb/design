"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  createdAt: string;
}

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [editEmailId, setEditEmailId] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState("");

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
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Aanmaken mislukt.");
      setName("");
      setEmail("");
      setPassword("");
      setRole("USER");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er ging iets mis.");
    } finally {
      setCreating(false);
    }
  }

  async function updateRole(id: string, newRole: "USER" | "ADMIN") {
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Wijzigen mislukt.");
      return;
    }
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
          Beheer wie kan inloggen op de Design Editor en wie beheerderstoegang heeft.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={createUser} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_140px_auto] sm:items-end">
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
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div>
              <Label>Rol</Label>
              <Select value={role} onChange={(e) => setRole(e.target.value as "USER" | "ADMIN")}>
                <option value="USER">Gebruiker</option>
                <option value="ADMIN">Beheerder</option>
              </Select>
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? "Bezig..." : "Toevoegen"}
            </Button>
          </form>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {users.map((u) => (
          <Card key={u.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">
                  {u.name}
                  {u.id === session?.user?.id && <span className="ml-2 text-xs text-muted-foreground">(jij)</span>}
                </p>
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
                <Badge variant={u.role === "ADMIN" ? "primary" : "outline"}>
                  {u.role === "ADMIN" ? "Beheerder" : "Gebruiker"}
                </Badge>
                <Select
                  className="h-8 w-40"
                  value={u.role}
                  onChange={(e) => updateRole(u.id, e.target.value as "USER" | "ADMIN")}
                >
                  <option value="USER">Gebruiker</option>
                  <option value="ADMIN">Beheerder</option>
                </Select>

                {resetId === u.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      placeholder="Nieuw wachtwoord"
                      className="h-8 w-40"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                    />
                    <Button size="sm" onClick={() => submitResetPassword(u.id)}>
                      Opslaan
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setResetId(null);
                        setResetPassword("");
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
