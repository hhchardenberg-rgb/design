"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Team {
  id: string;
  name: string;
}
interface Opponent {
  id: string;
  name: string;
}
interface Match {
  id: string;
  date: string;
  competition: string | null;
  location: string | null;
  isHome: boolean;
  status: string;
  scoreHome: number | null;
  scoreAway: number | null;
  team: Team;
  opponent: Opponent;
}

export default function AdminMatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [form, setForm] = useState({
    teamId: "",
    opponentId: "",
    isHome: true,
    date: "",
    time: "15:30",
    competition: "",
    location: "",
  });

  async function load() {
    const [matchesRes, teamsRes, opponentsRes] = await Promise.all([
      fetch("/api/admin/matches").then((r) => r.json()),
      fetch("/api/admin/teams").then((r) => r.json()),
      fetch("/api/admin/opponents").then((r) => r.json()),
    ]);
    setMatches(matchesRes.matches ?? []);
    setTeams(teamsRes.teams ?? []);
    setOpponents(opponentsRes.opponents ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function addMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!form.teamId || !form.opponentId || !form.date) return;
    await fetch("/api/admin/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        date: new Date(`${form.date}T${form.time}:00`).toISOString(),
      }),
    });
    setForm((f) => ({ ...f, date: "", competition: "", location: "" }));
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/matches/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Wedstrijden</h1>
        <p className="mt-1 text-muted-foreground">
          Eén wedstrijd kan voor meerdere visuals gebruikt worden (matchday, opstelling, uitslag, ...).
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={addMatch} className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Team</Label>
              <Select value={form.teamId} onChange={(e) => setForm((f) => ({ ...f, teamId: e.target.value }))}>
                <option value="">Kies team...</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Tegenstander</Label>
              <Select value={form.opponentId} onChange={(e) => setForm((f) => ({ ...f, opponentId: e.target.value }))}>
                <option value="">Kies tegenstander...</option>
                {opponents.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Thuis/uit</Label>
              <Select value={form.isHome ? "home" : "away"} onChange={(e) => setForm((f) => ({ ...f, isHome: e.target.value === "home" }))}>
                <option value="home">Thuis</option>
                <option value="away">Uit</option>
              </Select>
            </div>
            <div>
              <Label>Datum</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <Label>Tijd</Label>
              <Input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
            </div>
            <div>
              <Label>Competitie</Label>
              <Input value={form.competition} onChange={(e) => setForm((f) => ({ ...f, competition: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>Locatie</Label>
              <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
            </div>
            <Button type="submit" className="self-end">
              Wedstrijd toevoegen
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {matches.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3 text-sm">
            <div>
              <span className="font-medium">
                {m.isHome ? m.team.name : m.opponent.name} – {m.isHome ? m.opponent.name : m.team.name}
              </span>
              <span className="ml-2 text-muted-foreground">
                {format(new Date(m.date), "d MMM yyyy, HH:mm", { locale: nl })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{m.status}</Badge>
              <Button size="sm" variant="ghost" onClick={() => remove(m.id)}>
                Verwijderen
              </Button>
            </div>
          </div>
        ))}
        {matches.length === 0 && <p className="text-sm text-muted-foreground">Nog geen wedstrijden toegevoegd.</p>}
      </div>
    </div>
  );
}
