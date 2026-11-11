"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Input, Label, Select } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { formatDayTime } from "@/lib/date-format";
import { EVENT_STATUS_LABELS } from "@/lib/tickets/rules";
import { seasonOptionLabel } from "@/lib/commercial/season-phase";
import { api, errorText, EventStatusBadge, fromLocalInput, PageTitle, toLocalInput } from "@/components/tickets/parts";

interface EventRow {
  id: string;
  title: string;
  opponent: string | null;
  competition: string | null;
  isHome: boolean;
  location: string | null;
  startsAt: string;
  endsAt: string;
  seasonId: string | null;
  season: { name: string } | null;
  status: string;
  allowReentry: boolean;
  capacity: number | null;
  source: string;
  matchId: string | null;
  linkedTickets: number;
}
interface Season {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
}
interface Match {
  id: string;
  date: string;
  isHome: boolean;
  competition: string | null;
  team: string;
  opponent: string;
}

interface Draft {
  id: string | null;
  title: string;
  opponent: string;
  competition: string;
  isHome: boolean;
  location: string;
  startsAt: string;
  endsAt: string;
  seasonId: string;
  status: string;
  allowReentry: boolean;
  capacity: string;
  matchId: string;
}

const EMPTY: Draft = { id: null, title: "", opponent: "", competition: "", isHome: true, location: "", startsAt: "", endsAt: "", seasonId: "", status: "DRAFT", allowReentry: false, capacity: "", matchId: "" };

export function EventsManager({ canManage }: { canManage: boolean }) {
  const toast = useStableToast();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [all, setAll] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [e, s] = await Promise.all([api<{ events: EventRow[] }>(`/api/tickets/events${all ? "?alle=1" : ""}`), api<{ seasons: Season[] }>("/api/tickets/seasons")]);
      setEvents(e.events);
      setSeasons(s.seasons);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [all, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canManage || !draft || matches.length) return;
    api<{ matches: Match[] }>("/api/tickets/events/matches").then((r) => setMatches(r.matches), () => {});
  }, [canManage, draft, matches.length]);

  function edit(e: EventRow | null) {
    setDraft(
      e
        ? {
            id: e.id,
            title: e.title,
            opponent: e.opponent ?? "",
            competition: e.competition ?? "",
            isHome: e.isHome,
            location: e.location ?? "",
            startsAt: toLocalInput(e.startsAt),
            endsAt: toLocalInput(e.endsAt),
            seasonId: e.seasonId ?? "",
            status: e.status,
            allowReentry: e.allowReentry,
            capacity: e.capacity ? String(e.capacity) : "",
            matchId: e.matchId ?? "",
          }
        : { ...EMPTY },
    );
  }

  function pickMatch(id: string) {
    const m = matches.find((x) => x.id === id);
    if (!draft) return;
    if (!m) return setDraft({ ...draft, matchId: "" });
    setDraft({
      ...draft,
      matchId: m.id,
      title: draft.title || (m.isHome ? `${m.team} – ${m.opponent}` : `${m.opponent} – ${m.team}`),
      opponent: m.opponent,
      competition: m.competition ?? draft.competition,
      isHome: m.isHome,
      startsAt: toLocalInput(m.date),
    });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const body = {
        title: draft.title,
        opponent: draft.opponent,
        competition: draft.competition,
        isHome: draft.isHome,
        location: draft.location,
        startsAt: fromLocalInput(draft.startsAt),
        endsAt: draft.endsAt ? fromLocalInput(draft.endsAt) : null,
        seasonId: draft.seasonId || null,
        status: draft.status,
        allowReentry: draft.allowReentry,
        capacity: draft.capacity ? Number(draft.capacity) : null,
        matchId: draft.matchId || null,
      };
      await api(draft.id ? `/api/tickets/events/${draft.id}` : "/api/tickets/events", { method: draft.id ? "PUT" : "POST", body });
      toast.success("Wedstrijd opgeslagen.");
      setDraft(null);
      await load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageTitle title="Wedstrijden" description="Wedstrijden waarvoor HHC tickets uitgeeft en waarop later gescand wordt.">
        {canManage && (
          <Button onClick={() => edit(null)}>
            <Plus className="h-4 w-4" /> Nieuwe wedstrijd
          </Button>
        )}
      </PageTitle>

      {draft && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">{draft.id ? "Wedstrijd wijzigen" : "Nieuwe wedstrijd"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {matches.length > 0 && !draft.id && (
              <div className="sm:col-span-2">
                <Label htmlFor="ev-match">Overnemen uit de designtool (optioneel)</Label>
                <Select id="ev-match" value={draft.matchId} onChange={(e) => pickMatch(e.target.value)}>
                  <option value="">Niet koppelen</option>
                  {matches.map((m) => (
                    <option key={m.id} value={m.id}>
                      {formatDayTime(m.date)} · {m.isHome ? `${m.team} – ${m.opponent}` : `${m.opponent} – ${m.team}`}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="sm:col-span-2">
              <Label htmlFor="ev-title">Titel</Label>
              <Input id="ev-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="HHC Hardenberg – Tegenstander" />
            </div>
            <div>
              <Label htmlFor="ev-opp">Tegenstander</Label>
              <Input id="ev-opp" value={draft.opponent} onChange={(e) => setDraft({ ...draft, opponent: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ev-comp">Competitie</Label>
              <Input id="ev-comp" value={draft.competition} onChange={(e) => setDraft({ ...draft, competition: e.target.value })} placeholder="bv. Tweede divisie, Beker" />
            </div>
            <div>
              <Label htmlFor="ev-start">Aftrap</Label>
              <Input id="ev-start" type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ev-end">Einde (tickets vervallen daarna)</Label>
              <Input id="ev-end" type="datetime-local" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} />
              <p className="mt-1 text-xs text-muted-foreground">Leeg = 6 uur na de aftrap.</p>
            </div>
            <div>
              <Label htmlFor="ev-season">Seizoen</Label>
              <Select id="ev-season" value={draft.seasonId} onChange={(e) => setDraft({ ...draft, seasonId: e.target.value })}>
                <option value="">Automatisch op datum</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {seasonOptionLabel(s)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="ev-status">Status</Label>
              <Select id="ev-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                {Object.entries(EVENT_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="ev-loc">Locatie</Label>
              <Input id="ev-loc" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ev-cap">Capaciteit (optioneel)</Label>
              <Input id="ev-cap" type="number" min={1} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={draft.isHome} onChange={(e) => setDraft({ ...draft, isHome: e.target.checked })} /> Thuiswedstrijd
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={draft.allowReentry} onChange={(e) => setDraft({ ...draft, allowReentry: e.target.checked })} /> Herintrede toegestaan voor seizoenskaarten
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <Button onClick={save} disabled={busy || !draft.title || !draft.startsAt}>
                Opslaan
              </Button>
              <Button variant="outline" onClick={() => setDraft(null)}>
                Annuleren
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-3 flex items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox checked={all} onChange={(e) => setAll(e.target.checked)} /> Ook gespeelde wedstrijden tonen
        </label>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Laden…</p>
          ) : events.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nog geen wedstrijden. {canManage ? "Voeg de eerste toe." : ""}</p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDayTime(e.startsAt)} · {e.isHome ? "thuis" : "uit"}
                      {e.competition ? ` · ${e.competition}` : ""}
                      {e.season ? ` · ${e.season.name}` : ""}
                      {e.allowReentry ? " · herintrede seizoenskaarten" : ""}
                      {e.source === "FULLHOUSE" ? " · Fullhouse" : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">{e.linkedTickets} tickets</span>
                  <EventStatusBadge status={e.status} />
                  {canManage && e.source === "HHC" && (
                    <Button size="sm" variant="ghost" onClick={() => edit(e)} aria-label={`${e.title} wijzigen`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
