"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { formatDayTime } from "@/lib/date-format";
import { checkOffline, cacheExpired, parseHhcCode, type OfflineCache } from "@/lib/tickets/offline-check";

// Mobiele scanner (PWA). Scanners loggen in met een code en PIN; beheerders met een Hub-account
// gebruiken hun eigen sessie. De server beslist; zonder verbinding valt de app terug op de
// offline-lijst van deze wedstrijd en meldt de scans later terug.

interface Ctx {
  actor: { name: string; kind: "scanner" | "user"; canOverride: boolean; canSeeStats: boolean; entranceId: string | null };
  events: { id: string; title: string; status?: string; startsAt: string; endsAt: string; source: string; externalId: string | null }[];
  entrances: { id: string; name: string; zoneId: string | null }[];
}
interface Resp {
  scanId?: string;
  eventId?: string;
  result: "VALID" | "WARNING" | "INVALID";
  reasonLabel: string | null;
  reentry: boolean;
  overridden?: boolean;
  label: string | null;
  previous: { at: string; where: string | null } | null;
  overridable: boolean;
  offline?: boolean;
}
interface Queued {
  clientId: string;
  eventId: string;
  code: string;
  entranceId: string | null;
  scannedAt: string;
  offline: true;
  key: string | null;
  local: string;
}
interface Stats {
  valid: number;
  warnings: number;
  invalid: number;
  inside: number;
}

const LS = { token: "hhc_scan_token", ctx: "hhc_scan_ctx", sel: "hhc_scan_sel", queue: "hhc_scan_queue", cache: (id: string) => `hhc_scan_cache_${id}` };
const read = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* opslag vol of geblokkeerd */
  }
};
const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.trim())))).map((b) => b.toString(16).padStart(2, "0")).join("");
const newId = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

class NetworkError extends Error {}
class AuthError extends Error {}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = localStorage.getItem(LS.token);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
      headers: { ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: ctl.signal,
    });
  } catch {
    throw new NetworkError("Geen verbinding");
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) throw new AuthError(data.error ?? "Niet ingelogd.");
  if (!res.ok) throw new Error(data.error ?? "Er ging iets mis.");
  return data as T;
}

function beep(kind: "ok" | "warn" | "bad") {
  try {
    if (navigator.vibrate) navigator.vibrate(kind === "ok" ? 60 : kind === "warn" ? [120, 80, 120] : [300]);
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ac = new Ctor();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = kind === "ok" ? 880 : kind === "warn" ? 520 : 200;
    g.gain.value = 0.15;
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + (kind === "bad" ? 0.35 : 0.12));
    setTimeout(() => void ac.close(), 500);
  } catch {
    /* geluid is een extra */
  }
}

export function ScannerApp() {
  const [phase, setPhase] = useState<"checking" | "login" | "ready">("checking");
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [eventIds, setEventIds] = useState<string[]>([]);
  // De eerste gekozen wedstrijd is de "hoofdwedstrijd" voor tellingen; bij meerdere wedstrijden kiest de server per scan.
  const eventId = eventIds[0] ?? "";
  const [entranceId, setEntranceId] = useState("");
  const [result, setResult] = useState<Resp | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [cacheInfo, setCacheInfo] = useState<{ count: number; expiresAt: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastCode = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const lastScan = useRef<{ code: string; entranceId: string | null } | null>(null);
  const resultRef = useRef<Resp | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  // Opstarten: bestaande sessie hergebruiken (token of Hub-sessie), anders inloggen.
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/scan-sw.js", { scope: "/scan" }).catch(() => {});
    (async () => {
      try {
        const c = await call<Ctx>("/api/scan/context");
        write(LS.ctx, c);
        setCtx(c);
        setPhase("ready");
      } catch (e) {
        const cached = read<Ctx | null>(LS.ctx, null);
        if (e instanceof NetworkError && cached) {
          setCtx(cached);
          setOnline(false);
          setPhase("ready");
        } else {
          setPhase("login");
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!ctx) return;
    const sel = read<{ eventId?: string; eventIds?: string[]; entranceId?: string }>(LS.sel, {});
    const saved = (sel.eventIds ?? (sel.eventId ? [sel.eventId] : [])).filter((id) => ctx.events.some((e) => e.id === id));
    setEventIds(saved.length ? saved : ctx.events[0] ? [(ctx.events.find((e) => e.status === "ACTIVE") ?? ctx.events[0]).id] : []);
    setEntranceId(ctx.actor.entranceId ?? (ctx.entrances.some((e) => e.id === sel.entranceId) ? sel.entranceId! : ""));
  }, [ctx]);
  useEffect(() => {
    if (eventIds.length) write(LS.sel, { eventIds, entranceId });
  }, [eventIds, entranceId]);

  const loadCacheInfo = useCallback((ids: string[]) => {
    const caches = ids.map((id) => read<OfflineCache | null>(LS.cache(id), null)).filter((c): c is OfflineCache => !!c && !cacheExpired(c));
    setCacheInfo(caches.length ? { count: caches.reduce((n, c) => n + c.hhc.length + c.fullhouse.length, 0), expiresAt: caches.map((c) => c.expiresAt).sort()[0] } : null);
  }, []);
  const eventKey = eventIds.join(",");
  useEffect(() => {
    if (eventKey) loadCacheInfo(eventKey.split(","));
  }, [eventKey, loadCacheInfo]);

  // Terugmelden van offline scans.
  const sync = useCallback(async () => {
    const queue = read<Queued[]>(LS.queue, []);
    setPending(queue.length);
    if (queue.length === 0) return;
    try {
      const batch = queue.slice(0, 100);
      const { results } = await call<{ results: { clientId: string }[] }>("/api/scan/sync", { body: { scans: batch.map(({ key: _k, local: _l, ...s }) => s) } });
      const done = new Set(results.map((r) => r.clientId));
      const rest = read<Queued[]>(LS.queue, []).filter((q) => !done.has(q.clientId));
      write(LS.queue, rest);
      setPending(rest.length);
      setOnline(true);
    } catch (e) {
      if (e instanceof NetworkError) setOnline(false);
    }
  }, []);
  useEffect(() => {
    if (phase !== "ready") return;
    void sync();
    const t = setInterval(() => void sync(), 20000);
    const on = () => void sync();
    window.addEventListener("online", on);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", on);
    };
  }, [phase, sync]);

  // Aantallen voor beheerders.
  useEffect(() => {
    if (phase !== "ready" || !ctx?.actor.canSeeStats || !eventId) return;
    let alive = true;
    const load = () => call<Stats>(`/api/scan/stats?eventId=${eventId}`).then((s) => alive && setStats(s), () => {});
    void load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [phase, ctx, eventId]);

  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setResult(null);
    setOverrideOpen(false);
    setOverrideReason("");
  }, []);

  const submit = useCallback(
    async (code: string, override?: string) => {
      if (!eventId || !code.trim()) return;
      const entr = entranceId || null;
      lastScan.current = { code, entranceId: entr };
      const clientId = newId();
      const scannedAt = new Date().toISOString();
      let r: Resp;
      try {
        r = await call<Resp>("/api/scan/scan", { body: { eventId, ...(eventIds.length > 1 ? { eventIds } : {}), code, entranceId: entr, clientId, ...(override ? { override: { reason: override } } : {}) } });
        setOnline(true);
      } catch (e) {
        if (e instanceof AuthError) {
          localStorage.removeItem(LS.token);
          setPhase("login");
          return;
        }
        if (!(e instanceof NetworkError)) {
          setMessage(e instanceof Error ? e.message : "Er ging iets mis.");
          beep("bad");
          return;
        }
        setOnline(false);
        const caches = eventIds.map((id) => ({ id, cache: read<OfflineCache | null>(LS.cache(id), null) })).filter((x): x is { id: string; cache: OfflineCache } => !!x.cache);
        if (!caches.length) {
          setMessage("Geen verbinding en geen offline-lijst geladen voor deze wedstrijd.");
          beep("bad");
          return;
        }
        const isHhc = !!parseHhcCode(code);
        const hash = isHhc ? null : await sha256(code);
        const queue = read<Queued[]>(LS.queue, []);
        const zone = ctx?.entrances.find((x) => x.id === entr)?.zoneId ?? null;
        // Bij meerdere wedstrijden: de eerste lijst waar het ticket in staat, anders de eerste lijst.
        let matched = caches[0].id;
        let o = checkOffline(caches[0].cache, code, hash, new Map<string, string>(queue.filter((q) => q.key && q.eventId === caches[0].id && q.local === "VALID").map((q) => [q.key!, q.scannedAt])), zone);
        for (const { id, cache } of caches) {
          const used = new Map<string, string>(queue.filter((q) => q.key && q.eventId === id && q.local === "VALID").map((q) => [q.key!, q.scannedAt]));
          const res = checkOffline(cache, code, hash, used, zone);
          if (!("reason" in res) || res.reason !== "NOT_FOUND") {
            matched = id;
            o = res;
            break;
          }
        }
        const key = parseHhcCode(code)?.publicId ?? hash;
        // Nooit een offline-override: een supervisor doet dat met verbinding.
        write(LS.queue, [...queue, { clientId, eventId: matched, code, entranceId: entr, scannedAt, offline: true, key, local: o.result } satisfies Queued]);
        setPending(queue.length + 1);
        r = { result: o.result, reasonLabel: o.reason === "ALREADY_USED" ? "Ticket is al gebruikt" : o.reason === "NOT_FOUND" ? "Ticket staat niet in de offline-lijst" : o.reason === "WRONG_ZONE" ? "Ticket hoort bij een ander vak dan deze ingang" : o.reason ? "Offline-lijst is verlopen" : null, reentry: o.reentry, label: o.label, previous: o.result === "WARNING" ? { at: o.previousAt, where: null } : null, overridable: false, offline: true, eventId: matched };
      }
      setMessage(null);
      setResult(r);
      beep(r.result === "VALID" ? "ok" : r.result === "WARNING" ? "warn" : "bad");
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      if (r.result === "VALID") dismissTimer.current = setTimeout(() => setResult(null), 1800);
    },
    [eventId, eventIds, entranceId, ctx],
  );

  // Camera + QR-herkenning.
  useEffect(() => {
    if (phase !== "ready" || !eventId) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const g = canvas.getContext("2d", { willReadFrequently: true });
    type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const detector = BD ? new BD({ formats: ["qr_code", "code_128", "ean_13", "itf"] }) : null;
    let last = 0;
    const handle = (raw: string) => {
      const now = Date.now();
      if (resultRef.current) return;
      if (raw === lastCode.current.code && now - lastCode.current.at < 3000) return;
      lastCode.current = { code: raw, at: now };
      void submit(raw);
    };
    const tick = async () => {
      if (stopped) return;
      raf = requestAnimationFrame(() => void tick());
      const v = videoRef.current;
      const now = performance.now();
      if (!v || v.readyState < 2 || now - last < 120 || resultRef.current) return;
      last = now;
      try {
        if (detector) {
          const found = await detector.detect(v);
          if (found[0]?.rawValue) handle(found[0].rawValue);
        } else if (g) {
          const w = Math.min(640, v.videoWidth);
          const h = Math.round((v.videoHeight / v.videoWidth) * w);
          canvas.width = w;
          canvas.height = h;
          g.drawImage(v, 0, 0, w, h);
          const img = g.getImageData(0, 0, w, h);
          const q = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
          if (q?.data) handle(q.data);
        }
      } catch {
        /* een mislukt beeld is geen fout */
      }
    };
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
        setCameraError(null);
        raf = requestAnimationFrame(() => void tick());
      })
      .catch(() => setCameraError("De camera is niet beschikbaar. Geef toegang in je browser, of voer de code hieronder in."));
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [phase, eventId, submit]);

  async function downloadCache() {
    setBusy(true);
    try {
      let total = 0;
      const failed: string[] = [];
      for (const id of eventIds) {
        try {
          const c = await call<OfflineCache>(`/api/scan/cache?eventId=${id}`);
          write(LS.cache(id), c);
          total += c.hhc.length + c.fullhouse.length;
        } catch (e) {
          failed.push(`${ctx?.events.find((x) => x.id === id)?.title ?? id}: ${e instanceof Error ? e.message : "mislukt"}`);
        }
      }
      loadCacheInfo(eventIds);
      setMessage(`Offline-lijst geladen: ${total} tickets.${failed.length ? " Niet gelukt: " + failed.join(" · ") : ""}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Laden mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    localStorage.removeItem(LS.token);
    if (ctx?.actor.kind === "user") window.location.href = "/";
    else {
      setCtx(null);
      setPhase("login");
    }
  }

  if (phase === "checking") return <p className="p-8 text-center text-neutral-400">Laden…</p>;
  if (phase === "login") return <Login onDone={(c) => (setCtx(c), setPhase("ready"))} />;
  if (!ctx) return null;

  const tone = result?.result === "VALID" ? "bg-green-600" : result?.result === "WARNING" ? "bg-amber-500" : "bg-red-600";
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center justify-between gap-2 bg-[#f26a21] px-4 py-3 text-sm font-semibold">
        <span>HHC Scanner · {ctx.actor.name}</span>
        <button onClick={logout} className="rounded bg-black/20 px-2 py-1 text-xs">Uitloggen</button>
      </header>
      <div className="flex flex-wrap gap-2 bg-neutral-900 px-4 py-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 ${online ? "bg-green-700" : "bg-red-700"}`}>{online ? "Online" : "Offline"}</span>
        {pending > 0 && <span className="rounded-full bg-amber-600 px-2 py-0.5">{pending} nog terug te melden</span>}
        {stats && <span className="rounded-full bg-neutral-700 px-2 py-0.5">Binnen: {stats.inside} · Waarschuwingen: {stats.warnings}</span>}
      </div>

      {ctx.events.length === 0 ? (
        <p className="p-6 text-center text-neutral-300">Er is nu geen wedstrijd actief om te scannen.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 p-4">
            <div className="text-xs text-neutral-400">
              Wedstrijden ({eventIds.length} gekozen)
              <div className="mt-1 max-h-32 space-y-1 overflow-y-auto rounded bg-neutral-800 p-2 text-sm text-white">
                {ctx.events.map((e) => (
                  <label key={e.id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={eventIds.includes(e.id)}
                      onChange={(ev) => setEventIds((cur) => (ev.target.checked ? [...cur, e.id] : cur.length > 1 ? cur.filter((x) => x !== e.id) : cur))}
                      className="mt-1"
                    />
                    <span>
                      {e.title}
                      {e.status && e.status !== "ACTIVE" && <span className="ml-1 text-xs text-amber-400">({e.status === "DRAFT" ? "concept" : "afgesloten"})</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <label className="text-xs text-neutral-400">
              Ingang
              <select value={entranceId} onChange={(e) => setEntranceId(e.target.value)} disabled={!!ctx.actor.entranceId} className="mt-1 w-full rounded bg-neutral-800 p-2 text-sm text-white">
                <option value="">Kies…</option>
                {ctx.entrances.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="relative mx-4 aspect-square overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/60" />
            {cameraError && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-neutral-300">{cameraError}</p>}
          </div>

          <form
            className="flex gap-2 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget.elements.namedItem("code") as HTMLInputElement;
              void submit(f.value.trim());
              f.value = "";
            }}
          >
            <input name="code" autoComplete="off" autoCapitalize="characters" placeholder="Code handmatig of via scanner" className="min-w-0 flex-1 rounded bg-neutral-800 p-3 text-sm text-white placeholder:text-neutral-500" />
            <button className="rounded bg-[#f26a21] px-4 text-sm font-semibold">Controleer</button>
          </form>

          <div className="space-y-2 px-4 pb-6 text-xs text-neutral-400">
            {message && <p className="rounded bg-neutral-800 p-2 text-neutral-200">{message}</p>}
            <div className="flex items-center justify-between gap-2">
              <span>{cacheInfo ? `Offline-lijst: ${cacheInfo.count} tickets, geldig tot ${formatDayTime(cacheInfo.expiresAt)}` : "Geen offline-lijst geladen"}</span>
              <button onClick={downloadCache} disabled={busy || !online} className="rounded bg-neutral-800 px-3 py-1.5 text-white disabled:opacity-50">
                {cacheInfo ? "Vernieuwen" : "Laden"}
              </button>
            </div>
            {eventIds.length > 0 && <p>Laad de lijst vóór de wedstrijd, met verbinding. Zonder verbinding controleert de scanner alleen tickets uit die lijst en meldt alles later terug.</p>}
          </div>
        </>
      )}

      {result && (
        <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-8 text-center ${tone}`} onClick={result.result === "VALID" ? dismiss : undefined}>
          <p className="text-5xl font-black tracking-tight">{result.result === "VALID" ? (result.reentry ? "OPNIEUW BINNEN" : "GELDIG") : result.result === "WARNING" ? "AL GEBRUIKT" : "NIET GELDIG"}</p>
          {result.label && <p className="text-xl font-semibold">{result.label}</p>}
          {eventIds.length > 1 && result.eventId && <p className="text-sm opacity-90">{ctx.events.find((x) => x.id === result.eventId)?.title}</p>}
          {result.overridden && <p className="rounded bg-black/30 px-3 py-1 text-sm">Door supervisor toegelaten</p>}
          {result.reasonLabel && result.result !== "VALID" && <p className="text-lg">{result.reasonLabel}</p>}
          {result.previous && (
            <p className="text-base">
              Eerder gescand om {formatDayTime(result.previous.at)}
              {result.previous.where ? ` bij ${result.previous.where}` : ""}
            </p>
          )}
          {result.offline && <p className="rounded bg-black/30 px-3 py-1 text-sm">Offline beoordeeld; wordt later gecontroleerd door de server</p>}
          {result.result !== "VALID" && (
            <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
              {result.overridable && !overrideOpen && (
                <button onClick={() => setOverrideOpen(true)} className="rounded bg-white/90 p-3 font-semibold text-black">
                  Toch toelaten (supervisor)
                </button>
              )}
              {overrideOpen && (
                <div className="space-y-2 rounded bg-black/30 p-3 text-left">
                  <label className="text-sm">Reden (verplicht, komt in het auditlog)</label>
                  <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} className="w-full rounded p-2 text-black" />
                  <button
                    disabled={overrideReason.trim().length < 3}
                    onClick={() => {
                      const l = lastScan.current;
                      const reason = overrideReason.trim();
                      dismiss();
                      if (l) void submit(l.code, reason);
                    }}
                    className="w-full rounded bg-white p-2 font-semibold text-black disabled:opacity-50"
                  >
                    Laat toe
                  </button>
                </div>
              )}
              <button onClick={dismiss} className="rounded bg-black/40 p-3 font-semibold">
                Volgende scan
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Login({ onDone }: { onDone: (c: Ctx) => void }) {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/scan/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, pin }) });
      const data = (await r.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!r.ok || !data.token) throw new Error(data.error ?? "Inloggen mislukt.");
      localStorage.setItem(LS.token, data.token);
      const c = await call<Ctx>("/api/scan/context");
      write(LS.ctx, c);
      onDone(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inloggen mislukt.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={go} className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">HHC Scanner</h1>
      <p className="text-sm text-neutral-400">Log in met de code en PIN van je scanner. Heb je een Hub-account met scanrechten? Log dan eerst in op de Hub en open deze pagina opnieuw.</p>
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Scannercode" autoCapitalize="characters" autoComplete="off" className="rounded bg-neutral-800 p-3 text-lg tracking-widest text-white" />
      <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="PIN" inputMode="numeric" type="password" autoComplete="off" className="rounded bg-neutral-800 p-3 text-lg tracking-widest text-white" />
      {error && <p className="rounded bg-red-900 p-2 text-sm">{error}</p>}
      <button disabled={busy || code.length < 3 || pin.length < 4} className="rounded bg-[#f26a21] p-3 font-semibold disabled:opacity-50">
        Inloggen
      </button>
      <a href="/login?callbackUrl=/scan" className="text-center text-sm text-neutral-400 underline">
        Inloggen met Hub-account
      </a>
    </form>
  );
}
