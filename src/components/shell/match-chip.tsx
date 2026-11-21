"use client";

import { useEffect, useState } from "react";
import type { NextMatch } from "./types";

const TZ = "Europe/Amsterdam";

export function matchDayLabel(iso: string) {
  const d = new Date(iso);
  const wd = new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "short" }).format(d).replace(".", "");
  const dm = new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d).replace("-", "/");
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${dm}`;
}

/** "nog 6 d", "nog 5 u", "vandaag", "bezig": pas na het laden berekend (geen verschil server/browser). */
export function useCountdown(iso: string) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (now == null) return null;
  const ms = new Date(iso).getTime() - now;
  return { ms, days: Math.floor(ms / 86_400_000), hours: Math.floor((ms % 86_400_000) / 3_600_000), minutes: Math.floor((ms % 3_600_000) / 60_000) };
}

/** Kleine wedstrijdchip in de kopbalk: het ritme van de club, altijd in beeld. */
export function MatchChip({ match }: { match: NextMatch }) {
  const c = useCountdown(match.date);
  const opponent = match.isHome ? match.away : match.home;
  const left = c == null ? "" : c.ms <= 0 ? "bezig" : c.days >= 1 ? `${c.days} d` : c.hours >= 1 ? `${c.hours} u` : `${Math.max(c.minutes, 1)} min`;
  return (
    <div
      className="hidden h-9 items-center gap-2 rounded-lg bg-secondary px-3 text-sm font-semibold text-white sm:flex"
      title={`Eerstvolgende wedstrijd: ${match.home} – ${match.away}`}
      aria-label={`Eerstvolgende wedstrijd: ${match.home} – ${match.away}, ${matchDayLabel(match.date)}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-hhc-orange" aria-hidden />
      <span className="whitespace-nowrap">{matchDayLabel(match.date)}</span>
      <span className="hidden max-w-36 truncate font-medium text-white/75 xl:inline">
        {opponent} ({match.isHome ? "T" : "U"})
      </span>
      {left && <span className="stat-number text-[0.8125rem] text-hhc-orange">{left}</span>}
    </div>
  );
}
