"use client";

import { useEffect, useState } from "react";
import { LOCALES, type Locale } from "@/lib/tickets/i18n";

const UI: Record<Locale, { title: string; intro: string; email: string; submit: string; busy: string; error: string; done: string }> = {
  nl: { title: "Ticket kwijt?", intro: "Vul het e-mailadres in waarmee je ticket is uitgegeven. We sturen je ticket opnieuw naar dat adres.", email: "E-mailadres", submit: "Ticket opnieuw sturen", busy: "Bezig…", error: "Er ging iets mis.", done: "Als er tickets op dit e-mailadres staan, sturen we ze opnieuw. Kijk ook even in je spam." },
  en: { title: "Lost your ticket?", intro: "Enter the email address your ticket was issued to. We will send your ticket to that address again.", email: "Email address", submit: "Send my ticket again", busy: "Working…", error: "Something went wrong.", done: "If there are tickets for this email address, we will send them again. Please check your spam folder too." },
  de: { title: "Ticket verloren?", intro: "Gib die E-Mail-Adresse ein, auf die dein Ticket ausgestellt wurde. Wir schicken dein Ticket erneut an diese Adresse.", email: "E-Mail-Adresse", submit: "Ticket erneut senden", busy: "Einen Moment…", error: "Etwas ist schiefgelaufen.", done: "Falls für diese E-Mail-Adresse Tickets vorhanden sind, schicken wir sie erneut. Schau auch im Spam-Ordner nach." },
};

export function ResendForm() {
  const [locale, setLocale] = useState<Locale>("nl");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const u = UI[locale];
  useEffect(() => {
    const n = navigator.language.slice(0, 2);
    if (n === "de" || n === "en") setLocale(n);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/public/tickets/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || u.error);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : u.error);
    } finally {
      setBusy(false);
    }
  }

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
      <h1 className="text-xl font-bold">{u.title}</h1>
      {sent ? (
        <p className="rounded-md bg-surface-muted p-3 text-sm">{u.done}</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-muted-foreground">{u.intro}</p>
          <input className="h-11 w-full rounded-md border border-border bg-surface px-3 text-base" type="email" required placeholder={u.email} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button disabled={busy} className="h-11 w-full rounded-md bg-hhc-orange px-4 font-semibold text-white disabled:opacity-60">{busy ? u.busy : u.submit}</button>
        </form>
      )}
    </div>
  );
}
