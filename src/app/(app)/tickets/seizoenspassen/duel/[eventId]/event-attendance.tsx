"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, errorText } from "@/components/tickets/parts";
import { formatDayTime } from "@/lib/date-format";

type State = "ATTENDED" | "MISSED" | "UPCOMING" | "CANCELLED" | "EXCLUDED" | "NOT_ISSUED";
interface Data {
  event: { id: string; title: string; startsAt: string; status: string; excluded: boolean; allowReentry: boolean; past: boolean; live: boolean };
  season: { id: string; name: string; label: string } | null;
  summary: { expected: number; present: number; absent: number };
  rows: { id: string; publicId: string; name: string; type: string; zone: string | null; state: State; stateLabel: string; firstAt: string | null; entrance: string | null; reentries: number }[];
  personal: boolean;
}

const TONE: Record<State, string> = {
  ATTENDED: "font-medium text-success",
  MISSED: "text-amber-600",
  UPCOMING: "text-muted-foreground",
  CANCELLED: "text-muted-foreground",
  EXCLUDED: "text-muted-foreground",
  NOT_ISSUED: "text-muted-foreground",
};

export function EventAttendance({ eventId, canEditEvent }: { eventId: string; canEditEvent: boolean }) {
  const [filter, setFilter] = useState<"all" | "present" | "absent">("all");
  const [q, setQ] = useState("");
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(
      () => {
        const p = new URLSearchParams({ filter, ...(q ? { q } : {}) });
        api<Data>(`/api/tickets/seasonpasses/events/${eventId}?${p}`)
          .then((r) => {
            if (!alive) return;
            setD(r);
            setError(null);
          })
          .catch((e) => alive && setError(errorText(e)));
      },
      q ? 300 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [eventId, filter, q]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!d) return <p className="text-sm text-muted-foreground">Laden…</p>;
  const e = d.event;
  const s = d.summary;
  const pct = e.past && s.expected > 0 ? Math.round((s.present / s.expected) * 100) : null;
  return (
    <div className="space-y-5">
      <Link href="/tickets/seizoenspassen" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="h-4 w-4" /> Seizoenspassen
      </Link>
      <div>
        <h1 className="page-title">{e.title}</h1>
        <p className="text-sm text-muted-foreground">
          {formatDayTime(e.startsAt)}
          {d.season ? ` · ${d.season.label}` : " · nog geen seizoen"}
          {e.allowReentry ? " · herintrede aan" : " · herintrede uit"}
          {e.status === "CANCELLED" ? " · afgelast" : ""}
          {e.live ? " · bezig" : ""}
        </p>
      </div>

      {e.excluded && (
        <p className="rounded-md border border-border bg-surface-muted p-3 text-sm">
          Seizoenskaarten en -passen geven bij dit duel geen toegang.{" "}
          {canEditEvent && (
            <Link className="font-semibold text-hhc-orange-dark hover:underline" href="/tickets/wedstrijden">
              Aanpassen bij Wedstrijden
            </Link>
          )}
        </p>
      )}
      {!d.season && <p className="rounded-md border border-border bg-surface-muted p-3 text-sm">Dit duel valt in geen enkel seizoen, dus seizoenskaarten gelden er niet voor. Maak het seizoen aan of kies het seizoen bij Wedstrijden.</p>}

      {!e.excluded && d.season && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Houders voor dit duel", s.expected],
            [e.past ? "Aanwezig" : "Al binnen", s.present],
            ["Niet aanwezig", e.past ? s.absent : "–"],
            ["Opkomst", pct === null ? "–" : `${pct}%`],
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

      <div className="flex flex-wrap gap-2 text-sm">
        <select value={filter} onChange={(x) => setFilter(x.target.value as typeof filter)} className="h-10 rounded-md border border-border bg-surface px-3" aria-label="Filter">
          <option value="all">Alle houders</option>
          <option value="present">Wel aanwezig</option>
          <option value="absent">Niet aanwezig</option>
        </select>
        <Input className="w-56" value={q} onChange={(x) => setQ(x.target.value)} placeholder="Zoek op naam of nummer" />
      </div>

      {d.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen houders voor deze selectie.</p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Houder</th>
                  <th className="p-3">Soort</th>
                  <th className="p-3">Aanwezig</th>
                  <th className="p-3">Binnen om</th>
                  <th className="p-3">Ingang</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3">
                      <Link className="font-medium underline" href={`/tickets/seizoenspassen/${r.id}`}>
                        {r.name}
                      </Link>
                    </td>
                    <td className="p-3">
                      {r.type}
                      {r.zone ? ` · ${r.zone}` : ""}
                    </td>
                    <td className={`p-3 ${TONE[r.state]}`}>{r.state === "MISSED" && e.live ? "Nog niet binnen" : r.stateLabel}</td>
                    <td className="p-3 tabular-nums">
                      {r.firstAt ? formatDayTime(r.firstAt) : "–"}
                      {r.reentries > 0 ? <span className="ml-1 text-xs text-muted-foreground">(+{r.reentries}× opnieuw binnen)</span> : null}
                    </td>
                    <td className="p-3">{r.entrance ?? "–"}</td>
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
