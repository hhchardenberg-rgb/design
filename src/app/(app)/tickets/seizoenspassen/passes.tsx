"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, errorText, PageTitle } from "@/components/tickets/parts";
import { formatDayTime } from "@/lib/date-format";

interface Overview {
  seasons: { id: string; name: string; label: string }[];
  season: { id: string; name: string; label: string } | null;
  summary: { passes: number; fullhouse?: number; pastGames: number; upcomingGames: number; averagePct: number | null; noShow: number; streak3: number } | null;
  rows: { id: string; publicId: string; source?: "HHC" | "FULLHOUSE"; name: string; type: string; zone: string | null; eligible: number; attended: number; streak: number; lastSeen: string | null }[];
}

interface ByEvent {
  seasons: { id: string; name: string; label: string }[];
  season: { id: string; name: string; label: string } | null;
  events: { id: string; title: string; startsAt: string; status: string; excluded: boolean; past: boolean; live: boolean; expected: number; present: number; absent: number | null; pct: number | null }[];
}

type View = "houders" | "duels";

export function Passes({ canRenew, canExport }: { canRenew: boolean; canExport: boolean }) {
  const toast = useStableToast();
  const [view, setView] = useState<View>("houders");
  const [seasonId, setSeasonId] = useState("");
  const [filter, setFilter] = useState<"all" | "noshow" | "streak">("all");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ filter, ...(seasonId ? { seizoen: seasonId } : {}), ...(q ? { q } : {}) });
      const r = await api<Overview>(`/api/tickets/seasonpasses?${p}`);
      setData(r);
      setError(null);
      if (!seasonId && r.season) setSeasonId(r.season.id);
    } catch (e) {
      setError(errorText(e));
    }
  }, [seasonId, filter, q]);
  useEffect(() => {
    // Gekozen weergave onthouden (alleen in deze browser).
    try {
      const v = localStorage.getItem("hhc.seizoenspassen.weergave");
      if (v === "duels" || v === "houders") setView(v);
    } catch {
      /* geen opslag beschikbaar */
    }
  }, []);
  const switchView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("hhc.seizoenspassen.weergave", v);
    } catch {
      /* geen opslag beschikbaar */
    }
  };
  useEffect(() => {
    if (view !== "houders") return;
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q, view]);

  const s = data?.summary;
  return (
    <div className="space-y-5">
      <PageTitle title="Seizoenspassen" description="Wie komt er, en wie niet? Aanwezigheid per houder en per duel, verlengen naar een volgend seizoen en overdragen.">
        {canExport && (
          <a href={`/api/tickets/seasonpasses/export${seasonId ? `?seizoen=${encodeURIComponent(seasonId)}` : ""}`} className="inline-flex h-10 items-center rounded-md border border-border-strong bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
            Aanwezigheid exporteren (Excel)
          </a>
        )}
      </PageTitle>
      <div className="inline-flex rounded-lg border border-border bg-surface p-1 text-sm" role="tablist" aria-label="Weergave">
        {(
          [
            ["houders", "Per houder"],
            ["duels", "Per duel"],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => switchView(v)} className={`rounded-md px-4 py-1.5 font-medium ${view === v ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {l}
          </button>
        ))}
      </div>
      {view === "duels" ? (
        <EventsView seasonId={seasonId} onSeason={setSeasonId} />
      ) : (
        <>
      <div className="flex flex-wrap gap-2 text-sm">
        <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className="h-10 rounded-md border border-border bg-surface px-3" aria-label="Seizoen">
          {data?.seasons.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="h-10 rounded-md border border-border bg-surface px-3" aria-label="Filter">
          <option value="all">Alle actieve passen</option>
          <option value="noshow">Nog nooit geweest</option>
          <option value="streak">3 of meer duels gemist op rij</option>
        </select>
        <Input className="w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op naam of nummer" />
      </div>
      {error && <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
      {data && !data.season && <p className="text-sm text-muted-foreground">Er is nog geen seizoen aangemaakt.</p>}

      {s && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Actieve passen", s.fullhouse ? `${s.passes} (${s.fullhouse} Fullhouse)` : s.passes],
            ["Gemiddelde opkomst", s.averagePct === null ? "–" : `${s.averagePct}%`],
            ["Nog nooit geweest", s.noShow],
            ["3+ duels gemist", s.streak3],
            ["Duels gespeeld / te gaan", `${s.pastGames} / ${s.upcomingGames}`],
          ].map(([l, v]) => (
            <Card key={String(l)}>
              <CardContent className="p-4">
                <p className="stat-number mt-1 text-[1.875rem]">{v}</p>
                <p className="text-xs text-muted-foreground">{l}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && data.rows.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Houder</th>
                  <th className="p-3">Soort</th>
                  <th className="p-3">Geweest</th>
                  <th className="p-3">Op rij gemist</th>
                  <th className="p-3">Laatst gezien</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3">
                      <Link className="font-medium underline" href={`/tickets/seizoenspassen/${r.id}`}>
                        {r.name}
                      </Link>
                      {r.source === "FULLHOUSE" && <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted-foreground">Fullhouse</span>}
                    </td>
                    <td className="p-3">
                      {r.type}
                      {r.zone ? ` · ${r.zone}` : ""}
                    </td>
                    <td className="p-3 tabular-nums">
                      {r.attended} van {r.eligible}
                    </td>
                    <td className={`p-3 tabular-nums ${r.streak >= 3 ? "font-semibold text-amber-600" : ""}`}>{r.streak}</td>
                    <td className="p-3 tabular-nums">{r.lastSeen ? formatDayTime(r.lastSeen) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {data && data.season && data.rows.length === 0 && <p className="text-sm text-muted-foreground">Geen passen voor deze selectie.</p>}
        </>
      )}

      {canRenew && data && data.seasons.length > 1 && <Renew seasons={data.seasons} defaultFrom={data.season?.id ?? ""} toast={toast} onDone={() => void load()} />}
    </div>
  );
}

function EventsView({ seasonId, onSeason }: { seasonId: string; onSeason: (id: string) => void }) {
  const [data, setData] = useState<ByEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api<ByEvent>(`/api/tickets/seasonpasses/events${seasonId ? `?seizoen=${encodeURIComponent(seasonId)}` : ""}`)
      .then((r) => {
        if (!alive) return;
        setData(r);
        setError(null);
        if (!seasonId && r.season) onSeason(r.season.id);
      })
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [seasonId, onSeason]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <select value={seasonId} onChange={(e) => onSeason(e.target.value)} className="h-10 rounded-md border border-border bg-surface px-3" aria-label="Seizoen">
          {data?.seasons.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
      {data && !data.season && <p className="text-sm text-muted-foreground">Er is nog geen seizoen aangemaakt.</p>}
      {data && data.season && data.events.length === 0 && <p className="text-sm text-muted-foreground">Nog geen duels in dit seizoen. Duels uit Fullhouse en nieuwe wedstrijden komen hier vanzelf bij.</p>}
      {data && data.events.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Duel</th>
                  <th className="p-3">Aanwezig</th>
                  <th className="p-3">Niet aanwezig</th>
                  <th className="p-3">Opkomst</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.events.map((e) => (
                  <tr key={e.id}>
                    <td className="p-3">
                      <Link className="font-medium underline" href={`/tickets/seizoenspassen/duel/${e.id}`}>
                        {e.title}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{formatDayTime(e.startsAt)}</span>
                      {e.excluded && <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs">Geen seizoenskaarten</span>}
                      {e.status === "CANCELLED" && <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs">Afgelast</span>}
                      {e.live && <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-hhc-orange-dark">Bezig</span>}
                    </td>
                    {e.excluded || e.status === "CANCELLED" ? (
                      <td className="p-3 text-muted-foreground" colSpan={3}>
                        –
                      </td>
                    ) : !e.past ? (
                      <td className="p-3 text-muted-foreground" colSpan={3}>
                        Nog te spelen · {e.expected} houders
                      </td>
                    ) : (
                      <>
                        <td className="p-3 tabular-nums">
                          {e.present} van {e.expected}
                        </td>
                        <td className="p-3 tabular-nums">{e.absent ?? "–"}</td>
                        <td className="p-3 tabular-nums">{e.pct === null ? "–" : `${e.pct}%`}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Renew({ seasons, defaultFrom, toast, onDone }: { seasons: { id: string; name: string }[]; defaultFrom: string; toast: ReturnType<typeof useStableToast>; onDone: () => void }) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setFrom((f) => f || defaultFrom), [defaultFrom]);

  async function run() {
    if (!from || !to) return;
    if (!window.confirm("Nieuwe passen uitgeven voor alle actieve houders van het gekozen seizoen? Houders die al een pas hebben, worden overgeslagen.")) return;
    setBusy(true);
    try {
      const r = await api<{ created: number; pendingApproval: number; skipped: number; total: number }>("/api/tickets/seasonpasses/renew", { body: { fromSeasonId: from, toSeasonId: to } });
      toast.success(`${r.created} verlengd${r.pendingApproval ? `, ${r.pendingApproval} wachten op goedkeuring` : ""}${r.skipped ? `, ${r.skipped} overgeslagen (al verlengd)` : ""}.`);
      onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Verlengen naar een volgend seizoen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">Geeft per actieve pas een nieuwe pas uit voor het nieuwe seizoen, met dezelfde houder, soort en vak. De oude pas blijft geldig tot het einde van zijn seizoen. Opnieuw uitvoeren is veilig. Verstuur de nieuwe passen daarna per batch of per ticket per e-mail.</p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-md border border-border bg-surface px-3" aria-label="Van seizoen">
            {seasons.map((x) => (
              <option key={x.id} value={x.id}>
                Van {x.name}
              </option>
            ))}
          </select>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-md border border-border bg-surface px-3" aria-label="Naar seizoen">
            <option value="">Naar seizoen…</option>
            {seasons.filter((x) => x.id !== from).map((x) => (
              <option key={x.id} value={x.id}>
                Naar {x.name}
              </option>
            ))}
          </select>
          <Button disabled={busy || !from || !to} onClick={() => void run()}>
            {busy ? "Bezig…" : "Verlengen"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
