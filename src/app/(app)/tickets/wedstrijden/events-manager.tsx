"use client";

import { isSeasonCardSource, isSeasonCardTitle } from "@/lib/tickets/season-cards";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Pencil, Plus, RotateCcw, Palette, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Input, Label, Select } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { cn } from "@/lib/utils";
import { formatDayTime } from "@/lib/date-format";
import { EVENT_STATUS_LABELS } from "@/lib/tickets/rules";
import { seasonOptionLabel } from "@/lib/commercial/season-phase";
import { api, errorText, EventStatusBadge, fromLocalInput, PageTitle, toLocalInput } from "@/components/tickets/parts";
import { ChangeEvent } from "./change-event";
import { RemoveEvent } from "./remove-event";

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
  excludeSeasonCards: boolean;
  seasonCardSource?: boolean | null;
  capacity: number | null;
  source: string;
  matchId: string | null;
  linkedTickets: number;
  archivedAt: string | null;
  archivedBy: string | null;
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
  excludeSeasonCards: boolean;
  capacity: string;
  matchId: string;
}

/** Gelijke vierkante icoonknoppen in de actierij van een wedstrijd. */
const ICON_BTN = "h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground";

const EMPTY: Draft = { id: null, title: "", opponent: "", competition: "", isHome: true, location: "", startsAt: "", endsAt: "", seasonId: "", status: "ACTIVE", allowReentry: true, excludeSeasonCards: false, capacity: "", matchId: "" };

/** Wat elke status doet; staat onder het statusveld. */
const STATUS_HELP: Record<string, string> = {
  DRAFT: "Concept: alleen een label voor 'nog in voorbereiding'. Uitgeven en scannen werken al wel.",
  ACTIVE: "Actief: de wedstrijd gaat door. Uitgeven en scannen werken.",
  CLOSED: "Afgesloten: geen nieuwe tickets meer; scannen kan nog.",
  CANCELLED: "Afgelast: tickets voor alleen deze wedstrijd zijn ongeldig. Gebruik liever de knop Afgelasten, die houders ook mailt.",
};

interface FhDraft {
  id: string;
  title: string;
  status: string;
  seasonId: string;
  capacity: string;
  allowReentry: boolean;
  excludeSeasonCards: boolean;
  seasonCards: "auto" | "yes" | "no";
}

const SEASON_CARDS_VALUE = { auto: null, yes: true, no: false } as const;
const seasonCardsOf = (v: boolean | null | undefined): FhDraft["seasonCards"] => (v === true ? "yes" : v === false ? "no" : "auto");

export function EventsManager({ canManage, canMail = false, canDelete = false, canSeasons = false }: { canManage: boolean; canMail?: boolean; canDelete?: boolean; canSeasons?: boolean }) {
  const toast = useStableToast();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [all, setAll] = useState(false);
  const [archived, setArchived] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fh, setFh] = useState<FhDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  /** Welk uitklappaneel (afgelasten/verplaatsen of verwijderen) onder welke wedstrijd open staat. */
  const [panel, setPanel] = useState<{ id: string; kind: "change" | "remove" } | null>(null);
  const togglePanel = (id: string, kind: "change" | "remove") => setPanel((p) => (p?.id === id && p.kind === kind ? null : { id, kind }));

  const load = useCallback(async () => {
    try {
      const [e, s] = await Promise.all([api<{ events: EventRow[] }>(`/api/tickets/events${archived ? "?archief=1" : all ? "?alle=1" : ""}`), api<{ seasons: Season[] }>("/api/tickets/seasons")]);
      setEvents(e.events);
      setSeasons(s.seasons);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [all, archived, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function quick(fn: () => Promise<string>) {
    setBusy(true);
    try {
      toast.success(await fn());
      await load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const activate = (e: EventRow) => quick(async () => {
    await api(`/api/tickets/events/${e.id}`, e.source === "FULLHOUSE" ? { method: "PATCH", body: { status: "ACTIVE" } } : { method: "PUT", body: { title: e.title, opponent: e.opponent, competition: e.competition, isHome: e.isHome, location: e.location, startsAt: e.startsAt, endsAt: e.endsAt, seasonId: e.seasonId, status: "ACTIVE", allowReentry: e.allowReentry, excludeSeasonCards: e.excludeSeasonCards, capacity: e.capacity, matchId: e.matchId } });
    return `${e.title} staat nu op Actief.`;
  });

  async function saveFh() {
    if (!fh) return;
    await quick(async () => {
      await api(`/api/tickets/events/${fh.id}`, { method: "PATCH", body: { status: fh.status, seasonId: fh.seasonId || null, capacity: fh.capacity ? Number(fh.capacity) : null, allowReentry: fh.allowReentry, excludeSeasonCards: fh.excludeSeasonCards, seasonCardSource: SEASON_CARDS_VALUE[fh.seasonCards] } });
      setFh(null);
      return "Fullhouse-wedstrijd opgeslagen.";
    });
  }

  const drafts = events.filter((e) => e.status === "DRAFT" && new Date(e.endsAt) >= new Date()).length;

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
            excludeSeasonCards: e.excludeSeasonCards,
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
        excludeSeasonCards: draft.excludeSeasonCards,
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
      <PageTitle title="Wedstrijden" description="Wedstrijden waarvoor HHC tickets uitgeeft en waarop gescand wordt. Wedstrijden uit Fullhouse komen er vanzelf bij.">
        {canSeasons && (
          <Link href="/tickets/tickettypes#seizoenen" className={buttonVariants({ variant: "outline" })}>
            Seizoenen beheren
          </Link>
        )}
        {canManage && drafts > 0 && !archived && (
          <Button variant="outline" disabled={busy} onClick={() => quick(async () => { const r = await api<{ activated: number }>("/api/tickets/events/activate", { body: {} }); return `${r.activated} wedstrijd(en) op Actief gezet.`; })}>
            <CheckCircle2 className="h-4 w-4" /> Alle concepten activeren ({drafts})
          </Button>
        )}
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
              {seasons.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Nog geen seizoenen. {canSeasons ? <Link className="text-hhc-orange-dark hover:underline" href="/tickets/tickettypes#seizoenen">Voeg er een toe</Link> : "Vraag een beheerder er een toe te voegen."}
                </p>
              )}
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
              <p className="mt-1 text-xs text-muted-foreground">{STATUS_HELP[draft.status]}</p>
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
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <Checkbox className="mt-0.5" checked={draft.excludeSeasonCards} onChange={(e) => setDraft({ ...draft, excludeSeasonCards: e.target.checked })} />
              <span>
                Niet geldig voor seizoenskaarten
                <span className="block text-xs text-muted-foreground">Seizoenskaarten en -passen geven bij dit duel geen toegang en tellen niet als gemist. Losse tickets voor dit duel werken gewoon.</span>
              </span>
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

      {fh && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Fullhouse-wedstrijd instellen: {fh.title}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <p className="text-xs text-muted-foreground sm:col-span-2">Titel en aftrap komen uit Fullhouse en wijzig je daar. Hier stel je in wat alleen voor de Hub geldt.</p>
            <div>
              <Label htmlFor="fh-status">Status</Label>
              <Select id="fh-status" value={fh.status} onChange={(e) => setFh({ ...fh, status: e.target.value })}>
                {Object.entries(EVENT_STATUS_LABELS)
                  .filter(([k]) => k !== "CANCELLED")
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">{STATUS_HELP[fh.status]}</p>
            </div>
            <div>
              <Label htmlFor="fh-season">Seizoen</Label>
              <Select id="fh-season" value={fh.seasonId} onChange={(e) => setFh({ ...fh, seasonId: e.target.value })}>
                <option value="">Geen</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {seasonOptionLabel(s)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="fh-cap">Capaciteit (optioneel)</Label>
              <Input id="fh-cap" type="number" min={1} value={fh.capacity} onChange={(e) => setFh({ ...fh, capacity: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={fh.allowReentry} onChange={(e) => setFh({ ...fh, allowReentry: e.target.checked })} /> Herintrede toegestaan voor seizoenskaarten
            </label>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <Checkbox className="mt-0.5" checked={fh.excludeSeasonCards} onChange={(e) => setFh({ ...fh, excludeSeasonCards: e.target.checked })} />
              <span>
                Niet geldig voor seizoenskaarten
                <span className="block text-xs text-muted-foreground">Seizoenskaarten en -passen (uit de Hub en uit Fullhouse) geven bij dit duel geen toegang en tellen niet als gemist.</span>
              </span>
            </label>
            <div className="sm:col-span-2">
              <Label htmlFor="fh-cards">Verkoopt Fullhouse hier seizoenskaarten of -passen?</Label>
              <Select id="fh-cards" value={fh.seasonCards} onChange={(e) => setFh({ ...fh, seasonCards: e.target.value as FhDraft["seasonCards"] })}>
                <option value="auto">Automatisch: {isSeasonCardTitle(fh.title) ? "ja" : "nee"} (op naam)</option>
                <option value="yes">Ja</option>
                <option value="no">Nee</option>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Bij ja geven de kaarten van dit evenement toegang tot elk thuisduel van het gekozen seizoen, met dezelfde regels als eigen seizoenskaarten. Dit evenement telt dan zelf niet als duel.</p>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button onClick={saveFh} disabled={busy}>
                Opslaan
              </Button>
              <Button variant="outline" onClick={() => setFh(null)}>
                Annuleren
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
        {!archived && (
          <label className="flex items-center gap-2">
            <Checkbox checked={all} onChange={(e) => setAll(e.target.checked)} /> Ook gespeelde wedstrijden tonen
          </label>
        )}
        <label className="flex items-center gap-2">
          <Checkbox checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Gearchiveerde wedstrijden tonen
        </label>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Laden…</p>
          ) : events.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{archived ? "Geen gearchiveerde wedstrijden." : `Nog geen wedstrijden. ${canManage ? "Voeg de eerste toe." : ""}`}</p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((e) => {
                const open = panel?.id === e.id ? panel.kind : null;
                return (
                <li key={e.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                    <div className="min-w-[14rem] flex-1">
                      <p className="truncate font-medium">{e.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDayTime(e.startsAt)} · {e.isHome ? "thuis" : "uit"}
                        {e.competition ? ` · ${e.competition}` : ""}
                        {e.season ? ` · ${e.season.name}` : ""}
                        {isSeasonCardSource(e) ? " · seizoenskaarten voor alle thuisduels van het seizoen" : e.excludeSeasonCards ? " · geen seizoenskaarten" : e.allowReentry ? " · herintrede seizoenskaarten" : ""}
                        {e.source === "FULLHOUSE" ? " · Fullhouse" : ""}
                        {e.archivedAt ? ` · gearchiveerd ${formatDayTime(e.archivedAt)}${e.archivedBy ? ` door ${e.archivedBy}` : ""}` : ""}
                      </p>
                    </div>
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
                      <span className="mr-1 w-20 text-right text-xs text-muted-foreground tabular-nums">{e.linkedTickets} tickets</span>
                      <span className="mr-1 inline-flex w-[5.5rem] justify-center">
                        <EventStatusBadge status={e.status} />
                      </span>
                      {e.archivedAt ? (
                        canDelete && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => quick(async () => { await api(`/api/tickets/events/${e.id}/restore`, { body: {} }); return `${e.title} teruggezet.`; })}>
                            <RotateCcw className="h-4 w-4" /> Terugzetten
                          </Button>
                        )
                      ) : (
                        <>
                          {canManage && e.status === "DRAFT" && (
                            <Button size="sm" variant="outline" className="mr-1" disabled={busy} onClick={() => activate(e)} title="Status op Actief zetten">
                              <CheckCircle2 className="h-4 w-4" /> Activeren
                            </Button>
                          )}
                          {canManage && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className={ICON_BTN}
                              onClick={() => (e.source === "FULLHOUSE" ? setFh({ id: e.id, title: e.title, status: e.status === "CANCELLED" ? "ACTIVE" : e.status, seasonId: e.seasonId ?? "", capacity: e.capacity ? String(e.capacity) : "", allowReentry: e.allowReentry, excludeSeasonCards: e.excludeSeasonCards, seasonCards: seasonCardsOf(e.seasonCardSource) }) : edit(e))}
                              aria-label={`${e.title} wijzigen`}
                              title={e.source === "FULLHOUSE" ? "Status, seizoen en herintrede instellen" : "Wijzigen"}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Link href={`/tickets/ontwerp?scope=event:${e.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), ICON_BTN)} aria-label={`Ticketontwerp voor ${e.title}`} title="Ticketontwerp voor dit duel">
                            <Palette className="h-4 w-4" />
                          </Link>
                          {canManage && e.status !== "CLOSED" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className={cn(ICON_BTN, open === "change" && "bg-surface-muted text-foreground")}
                              onClick={() => togglePanel(e.id, "change")}
                              aria-label={`${e.title} afgelasten of verplaatsen`}
                              aria-expanded={open === "change"}
                              title="Afgelasten of verplaatsen"
                            >
                              <CalendarClock className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className={cn(ICON_BTN, "hover:text-destructive", open === "remove" && "bg-surface-muted text-destructive")}
                              onClick={() => togglePanel(e.id, "remove")}
                              aria-label={`${e.title} verwijderen of archiveren`}
                              aria-expanded={open === "remove"}
                              title="Verwijderen of archiveren"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {open && !e.archivedAt && (
                    <div className="px-4 pb-3">
                      {open === "change" ? (
                        <ChangeEvent event={e} canMail={canMail} onClose={() => setPanel(null)} onDone={() => void load()} />
                      ) : (
                        <RemoveEvent event={e} onClose={() => setPanel(null)} onDone={() => void load()} />
                      )}
                    </div>
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
