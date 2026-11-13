"use client";

import { useEffect, useState } from "react";
import { formatDayTime } from "@/lib/date-format";
import { LOCALES, type Locale } from "@/lib/tickets/i18n";

const UI: Record<Locale, { loading: string; multi: (n: number) => string; first: string; last: string; email: string; submit: string; busy: string; privacy: string; ok: string; mailed: string; notMailed: string; test: string; open: string }> = {
  nl: { loading: "Laden…", multi: (n) => `Je krijgt ${n} tickets: een voor jou en ${n - 1} om door te geven.`, first: "Voornaam", last: "Achternaam", email: "E-mailadres", submit: "Ticket aanvragen", busy: "Bezig…", privacy: "We gebruiken je gegevens alleen voor je ticket en de wedstrijddag.", ok: "Gelukt!", mailed: "Je ticket is onderweg naar je e-mailadres. Kijk ook even in je spam.", notMailed: "Je ticket is aangemaakt, maar de mail kon niet worden verstuurd. Neem contact op met HHC Hardenberg.", test: "Testomgeving:", open: "open je ticket" },
  en: { loading: "Loading…", multi: (n) => `You get ${n} tickets: one for you and ${n - 1} to pass on.`, first: "First name", last: "Last name", email: "Email address", submit: "Request ticket", busy: "Working…", privacy: "We only use your details for your ticket and match day.", ok: "Done!", mailed: "Your ticket is on its way to your email address. Check your spam folder too.", notMailed: "Your ticket was created, but the email could not be sent. Please contact HHC Hardenberg.", test: "Test environment:", open: "open your ticket" },
  de: { loading: "Laden…", multi: (n) => `Du bekommst ${n} Tickets: eines für dich und ${n - 1} zum Weitergeben.`, first: "Vorname", last: "Nachname", email: "E-Mail-Adresse", submit: "Ticket anfordern", busy: "Einen Moment…", privacy: "Wir verwenden deine Daten nur für dein Ticket und den Spieltag.", ok: "Geschafft!", mailed: "Dein Ticket ist unterwegs an deine E-Mail-Adresse. Schau auch im Spam-Ordner nach.", notMailed: "Dein Ticket wurde erstellt, aber die E-Mail konnte nicht gesendet werden. Bitte wende dich an HHC Hardenberg.", test: "Testumgebung:", open: "Ticket öffnen" },
};

interface Info {
  name: string;
  note: string | null;
  ticketsPerClaim: number;
  events: { title: string; startsAt: string }[];
  available: boolean;
  message: string | null;
}

export function ClaimForm({ code }: { code: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ firstName: "", lastName: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [locale, setLocale] = useState<Locale>("nl");
  const u = UI[locale];
  useEffect(() => {
    const n = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "nl";
    if (n === "de" || n === "en") setLocale(n);
  }, []);
  const [done, setDone] = useState<{ count: number; mailed: boolean; testLink: string | null } | null>(null);

  useEffect(() => {
    fetch(`/api/public/tickets/claim?code=${encodeURIComponent(code)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Deze code bestaat niet.");
        setInfo(d);
      })
      .catch((e: Error) => setError(e.message));
  }, [code]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/public/tickets/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, ...f, locale }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Er ging iets mis.");
      setDone(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er ging iets mis.");
    } finally {
      setBusy(false);
    }
  }

  const input = "h-11 w-full rounded-md border border-border bg-surface px-3 text-base";
  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-hhc-orange-dark">HHC Hardenberg</p>
        <div className="flex gap-2 text-xs font-semibold">
          {(Object.keys(LOCALES) as Locale[]).map((l) => (
            <button key={l} type="button" onClick={() => setLocale(l)} className={locale === l ? "underline" : "text-muted-foreground"}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div>
      {!info && !error && <p className="text-sm text-muted-foreground">{u.loading}</p>}
      {error && !done && <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
      {info && !done && (
        <>
          <div>
            <h1 className="text-xl font-bold">{info.name}</h1>
            {info.note && <p className="mt-1 text-sm text-muted-foreground">{info.note}</p>}
            {info.events.length > 0 && (
              <ul className="mt-2 text-sm">
                {info.events.map((e, i) => (
                  <li key={i}>
                    {e.title} · {formatDayTime(e.startsAt)}
                  </li>
                ))}
              </ul>
            )}
            {info.ticketsPerClaim > 1 && <p className="mt-2 text-sm">{u.multi(info.ticketsPerClaim)}</p>}
          </div>
          {info.available ? (
            <form onSubmit={submit} className="space-y-3">
              <input className={input} placeholder={u.first} required value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} autoComplete="given-name" />
              <input className={input} placeholder={u.last} required value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} autoComplete="family-name" />
              <input className={input} type="email" placeholder={u.email} required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
              <button disabled={busy} className="h-11 w-full rounded-md bg-hhc-orange px-4 font-semibold text-white disabled:opacity-60">
                {busy ? u.busy : u.submit}
              </button>
              <p className="text-xs text-muted-foreground">{u.privacy}</p>
            </form>
          ) : (
            <p className="rounded-md bg-surface-muted p-3 text-sm">{info.message}</p>
          )}
        </>
      )}
      {done && (
        <div className="space-y-2 text-sm">
          <h1 className="text-xl font-bold">{u.ok}</h1>
          {done.mailed ? <p>{u.mailed}</p> : <p>{u.notMailed}</p>}
          {done.testLink && (
            <p>
              {u.test} <a className="underline" href={done.testLink}>{u.open}</a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
