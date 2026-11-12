"use client";

import { useEffect, useState } from "react";
import { formatDayTime } from "@/lib/date-format";

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
      const r = await fetch("/api/public/tickets/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, ...f }) });
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
      <p className="text-sm font-semibold text-hhc-orange-dark">HHC Hardenberg</p>
      {!info && !error && <p className="text-sm text-muted-foreground">Laden…</p>}
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
            {info.ticketsPerClaim > 1 && <p className="mt-2 text-sm">Je krijgt {info.ticketsPerClaim} tickets: een voor jou en {info.ticketsPerClaim - 1} om door te geven.</p>}
          </div>
          {info.available ? (
            <form onSubmit={submit} className="space-y-3">
              <input className={input} placeholder="Voornaam" required value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} autoComplete="given-name" />
              <input className={input} placeholder="Achternaam" required value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} autoComplete="family-name" />
              <input className={input} type="email" placeholder="E-mailadres" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
              <button disabled={busy} className="h-11 w-full rounded-md bg-hhc-orange px-4 font-semibold text-white disabled:opacity-60">
                {busy ? "Bezig…" : "Ticket aanvragen"}
              </button>
              <p className="text-xs text-muted-foreground">We gebruiken je gegevens alleen voor je ticket en de wedstrijddag.</p>
            </form>
          ) : (
            <p className="rounded-md bg-surface-muted p-3 text-sm">{info.message}</p>
          )}
        </>
      )}
      {done && (
        <div className="space-y-2 text-sm">
          <h1 className="text-xl font-bold">Gelukt!</h1>
          {done.mailed ? <p>Je ticket is onderweg naar je e-mailadres. Kijk ook even in je spam.</p> : <p>Je ticket is aangemaakt, maar de mail kon niet worden verstuurd. Neem contact op met HHC Hardenberg.</p>}
          {done.testLink && (
            <p>
              Testomgeving: <a className="underline" href={done.testLink}>open je ticket</a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
