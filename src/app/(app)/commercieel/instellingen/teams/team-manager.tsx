"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api } from "@/lib/commercial/client";

interface Data {
  teams: { id: string; name: string; memberIds: string[] }[];
  candidates: { id: string; name: string }[];
}

export function TeamManager({ canManage, canCreate }: { canManage: boolean; canCreate: boolean }) {
  const toast = useStableToast();
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const r = await api<Data>("/api/commercial/teams");
    if (r.ok) {
      setData(r.data);
      setDraft(Object.fromEntries(r.data.teams.map((t) => [t.id, t.memberIds])));
    } else toast.error(r.error);
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await api("/api/commercial/teams", "POST", { name });
    if (r.ok) {
      setName("");
      await load();
    } else toast.error(r.error);
  }
  async function save(teamId: string) {
    const r = await api(`/api/commercial/teams/${teamId}/members`, "PUT", { userIds: draft[teamId] ?? [] });
    if (r.ok) {
      toast.success("Team opgeslagen.");
      await load();
    } else toast.error(r.error);
  }

  if (!data) return <p className="text-sm text-muted-foreground">Laden…</p>;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Teams</h1>
        <p className="text-sm text-muted-foreground">Teams bepalen wat iemand met het bereik “Eigen team” ziet. Teamleden wijzigen is een rechtenwijziging en vereist rechtenbeheer.</p>
      </div>
      {canCreate && (
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48"><Label htmlFor="team-name">Nieuw team</Label><Input id="team-name" required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <Button type="submit">Aanmaken</Button>
        </form>
      )}
      {data.teams.length === 0 && <p className="text-sm text-muted-foreground">Er zijn nog geen teams.</p>}
      {data.teams.map((t) => (
        <Card key={t.id}>
          <CardHeader>
            <CardTitle>{t.name}</CardTitle>
            <CardDescription>{(draft[t.id] ?? []).length} lid/leden</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-1.5 sm:grid-cols-2">
              {data.candidates.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-hhc-orange" disabled={!canManage} checked={(draft[t.id] ?? []).includes(c.id)}
                    onChange={(e) => setDraft((d) => ({ ...d, [t.id]: e.target.checked ? [...(d[t.id] ?? []), c.id] : (d[t.id] ?? []).filter((x) => x !== c.id) }))} />
                  {c.name}
                </label>
              ))}
            </div>
            {canManage && <Button size="sm" onClick={() => save(t.id)}>Opslaan</Button>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
