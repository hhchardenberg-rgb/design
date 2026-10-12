"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/toast";

interface UserRow {
  id: string;
  name: string;
  email: string;
  hasAccess: boolean;
  roleId: string | null;
}
interface RoleRow {
  id: string;
  key: string;
  name: string;
}

export function AccessAdmin() {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [roleFor, setRoleFor] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/commercial/access", { cache: "no-store" });
    if (!res.ok) {
      setError("De gegevens konden niet worden geladen.");
      return;
    }
    const data = (await res.json()) as { users: UserRow[]; roles: RoleRow[] };
    setUsers(data.users);
    setRoles(data.roles);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(userId: string, method: "POST" | "DELETE") {
    setBusy(userId);
    const res =
      method === "POST"
        ? await fetch("/api/admin/commercial/access", {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, roleId: roleFor[userId] || null }),
          })
        : await fetch(`/api/admin/commercial/access?userId=${encodeURIComponent(userId)}`, { method });
    setBusy(null);
    if (res.ok) {
      toast.success(method === "POST" ? "Toegang gegeven." : "Toegang ingetrokken.");
      await load();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      toast.error(typeof data.error === "string" ? data.error : "Dit is niet gelukt.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Toegang Commerciële Zaken</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hier bepaal je wie de sectie Commerciële Zaken kan openen. Dit geeft geen inzage in de inhoud en wordt niet
          automatisch aan beheerders gegeven. De bevoegdheden binnen de sectie stelt een lid met rechtenbeheer in.
          Wijs minstens één persoon de rol “Beheerder Commerciële Zaken” toe.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Card>
        <CardHeader>
          <CardTitle>Gebruikers</CardTitle>
          <CardDescription>Elke wijziging wordt vastgelegd in de wijzigingenlijst van de sectie.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{u.name}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {u.hasAccess ? (
                    <>
                      <Badge variant="success">Heeft toegang</Badge>
                      <Button variant="outline" size="sm" disabled={busy === u.id} onClick={() => call(u.id, "DELETE")}>
                        Intrekken
                      </Button>
                    </>
                  ) : (
                    <>
                      <select
                        aria-label={`Startrol voor ${u.name}`}
                        className="h-8 rounded-md border border-border bg-surface px-2 text-xs"
                        value={roleFor[u.id] ?? ""}
                        onChange={(e) => setRoleFor((r) => ({ ...r, [u.id]: e.target.value }))}
                      >
                        <option value="">Geen rol (nog geen bevoegdheden)</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                      <Button size="sm" disabled={busy === u.id} onClick={() => call(u.id, "POST")}>
                        Toegang geven
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
