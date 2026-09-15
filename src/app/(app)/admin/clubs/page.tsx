"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  number: number | null;
  position: string | null;
}
interface Team {
  id: string;
  name: string;
  shortName: string | null;
  ageGroup: string | null;
  players: Player[];
}
interface Club {
  id: string;
  name: string;
  isOwnClub: boolean;
  teams: Team[];
}
interface Opponent {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
}

export default function AdminClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [newTeam, setNewTeam] = useState<Record<string, string>>({});
  const [newPlayer, setNewPlayer] = useState<Record<string, { firstName: string; lastName: string; number: string }>>({});
  const [newOpponent, setNewOpponent] = useState({ name: "", logoUrl: "" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [clubsRes, opponentsRes] = await Promise.all([
      fetch("/api/admin/clubs").then((r) => r.json()),
      fetch("/api/admin/opponents").then((r) => r.json()),
    ]);
    setClubs(clubsRes.clubs ?? []);
    setOpponents(opponentsRes.opponents ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function addTeam(clubId: string) {
    const name = newTeam[clubId];
    if (!name) return;
    await fetch("/api/admin/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId, name, shortName: name }),
    });
    setNewTeam((prev) => ({ ...prev, [clubId]: "" }));
    await load();
  }

  async function addPlayer(teamId: string) {
    const p = newPlayer[teamId];
    if (!p?.firstName || !p?.lastName) return;
    await fetch("/api/admin/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, firstName: p.firstName, lastName: p.lastName, number: p.number || undefined }),
    });
    setNewPlayer((prev) => ({ ...prev, [teamId]: { firstName: "", lastName: "", number: "" } }));
    await load();
  }

  async function addOpponent(e: React.FormEvent) {
    e.preventDefault();
    if (!newOpponent.name) return;
    await fetch("/api/admin/opponents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newOpponent),
    });
    setNewOpponent({ name: "", logoUrl: "" });
    await load();
  }

  async function removeOpponent(id: string) {
    if (!confirm("Deze tegenstander verwijderen?")) return;
    setError(null);
    const res = await fetch(`/api/admin/opponents/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Verwijderen mislukt.");
      return;
    }
    await load();
  }

  async function removeTeam(id: string) {
    if (!confirm("Dit team en alle bijbehorende spelers en wedstrijden verwijderen?")) return;
    setError(null);
    const res = await fetch(`/api/admin/teams/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Verwijderen mislukt.");
      return;
    }
    await load();
  }

  async function removePlayer(id: string) {
    if (!confirm("Deze speler verwijderen?")) return;
    setError(null);
    const res = await fetch(`/api/admin/players/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Verwijderen mislukt.");
      return;
    }
    await load();
  }

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold">Club, teams &amp; spelers</h1>
        <p className="mt-1 text-muted-foreground">Centrale clubgegevens zodat je ze niet telkens opnieuw hoeft in te typen.</p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {clubs.map((club) => (
        <section key={club.id}>
          <h2 className="mb-3 text-lg font-semibold">{club.name}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {club.teams.map((team) => (
              <Card key={team.id}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>{team.name}</CardTitle>
                  <button
                    type="button"
                    title="Team verwijderen"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeTeam(team.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {team.players.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <span>
                        {p.number ? `#${p.number} ` : ""}
                        {p.firstName} {p.lastName}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{p.position}</span>
                        <button
                          type="button"
                          title="Speler verwijderen"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => removePlayer(p.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  ))}
                  <div className="mt-2 flex gap-2">
                    <Input
                      placeholder="Voornaam"
                      className="h-8"
                      value={newPlayer[team.id]?.firstName ?? ""}
                      onChange={(e) =>
                        setNewPlayer((prev) => ({ ...prev, [team.id]: { ...prev[team.id], firstName: e.target.value, lastName: prev[team.id]?.lastName ?? "", number: prev[team.id]?.number ?? "" } }))
                      }
                    />
                    <Input
                      placeholder="Achternaam"
                      className="h-8"
                      value={newPlayer[team.id]?.lastName ?? ""}
                      onChange={(e) =>
                        setNewPlayer((prev) => ({ ...prev, [team.id]: { ...prev[team.id], lastName: e.target.value, firstName: prev[team.id]?.firstName ?? "", number: prev[team.id]?.number ?? "" } }))
                      }
                    />
                    <Input
                      placeholder="#"
                      className="h-8 w-16"
                      value={newPlayer[team.id]?.number ?? ""}
                      onChange={(e) =>
                        setNewPlayer((prev) => ({ ...prev, [team.id]: { ...prev[team.id], number: e.target.value, firstName: prev[team.id]?.firstName ?? "", lastName: prev[team.id]?.lastName ?? "" } }))
                      }
                    />
                    <Button size="sm" variant="outline" onClick={() => addPlayer(team.id)}>
                      +
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              placeholder="Nieuw team (bijv. HHC Onder 19)"
              value={newTeam[club.id] ?? ""}
              onChange={(e) => setNewTeam((prev) => ({ ...prev, [club.id]: e.target.value }))}
              className="max-w-xs"
            />
            <Button variant="outline" onClick={() => addTeam(club.id)}>
              Team toevoegen
            </Button>
          </div>
        </section>
      ))}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Tegenstanders-bibliotheek</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Logo&apos;s van tegenstanders worden automatisch voorgesteld zodra een gebruiker de clubnaam intypt.
        </p>
        <Card>
          <CardContent className="p-6">
            <form onSubmit={addOpponent} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div>
                <Label>Clubnaam</Label>
                <Input value={newOpponent.name} onChange={(e) => setNewOpponent((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <Label>Logo-URL</Label>
                <Input value={newOpponent.logoUrl} onChange={(e) => setNewOpponent((p) => ({ ...p, logoUrl: e.target.value }))} placeholder="https://..." />
              </div>
              <Button type="submit">Toevoegen</Button>
            </form>
          </CardContent>
        </Card>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {opponents.map((o) => (
            <div key={o.id} className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface p-3">
              {o.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.logoUrl} alt={o.name} className="h-12 w-12 object-contain" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-surface-muted" />
              )}
              <span className="text-center text-xs font-medium">{o.name}</span>
              <button className="text-xs text-destructive hover:underline" onClick={() => removeOpponent(o.id)}>
                verwijderen
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
