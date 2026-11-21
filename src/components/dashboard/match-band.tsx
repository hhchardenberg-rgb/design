"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useCountdown } from "@/components/shell/match-chip";
import type { NextMatch } from "@/components/shell/types";

const TZ = "Europe/Amsterdam";

function longDate(iso: string) {
  const d = new Date(iso);
  const wd = new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long" }).format(d);
  const p = Object.fromEntries(new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${p.day}/${p.month}/${p.year} · ${p.hour}:${p.minute}`;
}

function Unit({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="stat-number text-[2.75rem] text-white sm:text-[3.25rem]">{value}</p>
      <p className="eyebrow mt-1.5 text-[0.625rem] text-[#8f8d87]">{label}</p>
    </div>
  );
}

/**
 * De wedstrijdband: de eerstvolgende wedstrijd als hart van het overzicht, in
 * HHC-zwart met een oranje veldlijn. Met directe matchday-acties.
 */
export function MatchBand({ match, actions, emptyHref }: { match: NextMatch | null; actions: { label: string; href: string }[]; emptyHref: string }) {
  const c = useCountdown(match?.date ?? new Date().toISOString());
  const pad = (n: number) => String(Math.max(n, 0)).padStart(2, "0");
  const live = !!match && c != null && c.ms <= 0;

  if (!match) {
    return (
      <section className="relative overflow-hidden rounded-xl bg-secondary px-6 py-7 text-white sm:px-8">
        <p className="eyebrow text-[#8f8d87]">Eerstvolgende wedstrijd</p>
        <p className="mt-2 font-heading text-2xl font-bold">Er staat nog geen wedstrijd gepland</p>
        <p className="mt-1 text-sm text-white/65">Zodra er een wedstrijd is ingevoerd, zie je hier het aftellen en de matchday-acties.</p>
        <Link href={emptyHref} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-hhc-orange hover:underline">
          <CalendarDays className="h-4 w-4" /> Naar de agenda
        </Link>
        <span aria-hidden className="absolute bottom-0 left-0 h-[3px] w-1/3 bg-hhc-orange" />
      </section>
    );
  }

  return (
    <section aria-label="Eerstvolgende wedstrijd" className="relative grid overflow-hidden rounded-xl bg-secondary text-white lg:grid-cols-[1.35fr_1fr_1fr]">
      {/* Middencirkel als subtiele veldlijn */}
      <span aria-hidden className="pointer-events-none absolute -right-36 -bottom-44 hidden h-80 w-80 lg:block rounded-full border border-white/[0.06]" />
      <div className="relative px-6 pt-6 pb-7 sm:px-8 lg:py-7">
        <p className="eyebrow text-[#8f8d87]">
          Eerstvolgende wedstrijd · {match.isHome ? "Thuis" : "Uit"}
          {match.competition ? ` · ${match.competition}` : ""}
        </p>
        <p className="mt-3 font-heading text-[1.75rem] leading-[1.05] font-bold sm:text-[2rem]">
          {match.home} <span className="text-white/45">–</span> {match.away}
        </p>
        <p className="mt-2 text-sm text-white/65">{longDate(match.date)}</p>
        <span aria-hidden className="absolute bottom-0 left-0 h-[3px] w-[62%] bg-hhc-orange lg:w-full" />
      </div>
      <div className="relative border-t border-white/10 px-6 py-6 sm:px-8 lg:border-t-0 lg:border-l lg:py-7">
        <p className="eyebrow text-[#8f8d87]">{live ? "Wedstrijd" : "Aftrap over"}</p>
        {live ? (
          <p className="mt-3 flex items-center gap-2 font-heading text-[2rem] font-bold">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-hhc-orange" /> Bezig
          </p>
        ) : (
          <div className="mt-3 flex gap-5 sm:gap-7" aria-live="off">
            <Unit value={c ? pad(c.days) : "––"} label={c?.days === 1 ? "dag" : "dagen"} />
            <Unit value={c ? pad(c.hours) : "––"} label="uur" />
            <Unit value={c ? pad(c.minutes) : "––"} label="min" />
          </div>
        )}
      </div>
      <div className="relative border-t border-white/10 px-6 py-6 sm:px-8 lg:border-t-0 lg:border-l lg:py-7">
        <p className="eyebrow text-[#8f8d87]">Matchday-afbeeldingen</p>
        <ul className="mt-2">
          {actions.slice(0, 4).map((a) => (
            <li key={a.href}>
              <Link href={a.href} className="group flex items-center justify-between gap-3 border-b border-white/10 py-2.5 text-sm font-medium text-white/90 hover:text-white">
                <span className="truncate">{a.label}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-hhc-orange transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
