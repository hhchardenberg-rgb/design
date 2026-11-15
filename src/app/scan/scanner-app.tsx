"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { AlertTriangle, Check, ChevronRight, Flashlight, FlashlightOff, Loader2, RotateCcw, Settings, WifiOff, X } from "lucide-react";
import { formatDay, formatDayTime } from "@/lib/date-format";
import { checkOffline, cacheExpired, parseHhcCode, scanKey, ticketNumberFrom, type OfflineCache } from "@/lib/tickets/offline-check";

// Mobiele scanner (PWA) voor de ingang. Scanners loggen in met een code en PIN; beheerders met een
// Hub-account gebruiken hun eigen sessie. De server beslist; zonder verbinding valt de app terug op de
// offline-lijst van de gekozen wedstrijd(en) en meldt de scans later terug.
//
// Ontwerpregels: één blik moet genoeg zijn. Groen = naar binnen, oranje = stoppen en kijken,
// rood = niet naar binnen. Elke uitslag heeft ook een icoon en een woord (niet alleen kleur),
// een eigen geluid en trilpatroon, en een reden in gewone taal.

interface Ctx {
  actor: { name: string; kind: "scanner" | "user"; canOverride: boolean; canSeeStats: boolean; entranceId: string | null };
  events: { id: string; title: string; status?: string; startsAt: string; endsAt: string; source: string; externalId: string | null; allowReentry?: boolean }[];
  entrances: { id: string; name: string; zoneId: string | null }[];
}
type Outcome = "VALID" | "WARNING" | "INVALID" | "ERROR";
interface Resp {
  scanId?: string;
  eventId?: string;
  result: Outcome;
  reasonLabel: string | null;
  reentry: boolean;
  overridden?: boolean;
  label: string | null;
  zone?: string | null;
  detail?: string | null;
  byNumber?: boolean;
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
interface Recent {
  id: string;
  scanId?: string;
  at: string;
  result: Outcome | "VOIDED";
  label: string | null;
  reason: string | null;
  eventId: string | null;
  key: string | null;
  offline: boolean;
  /** Offline toegelaten, maar de server keurde hem bij het terugmelden af. */
  conflict?: string;
}
interface Stats {
  valid: number;
  warnings: number;
  invalid: number;
  inside: number;
}

const LS = {
  token: "hhc_scan_token",
  ctx: "hhc_scan_ctx",
  sel: "hhc_scan_sel",
  queue: "hhc_scan_queue",
  recent: "hhc_scan_recent",
  cache: (id: string) => `hhc_scan_cache_${id}`,
  /** Tickets die op dit apparaat zijn toegelaten, per wedstrijd. Blijft staan na terugmelden, zodat een tweede scan zonder verbinding ook "al gebruikt" geeft. */
  seen: (id: string) => `hhc_scan_seen_${id}`,
};
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
const timeOf = (iso: string) => formatDayTime(iso).slice(11);
const isToday = (iso: string) => formatDay(iso) === formatDay(new Date());

const CACHE_REFRESH_MS = 10 * 60_000;
const SAME_CODE_QUIET_MS = 6000;
const OVERRIDE_REASONS = ["Ticket op ander toestel getoond", "Storing bij controle", "Staf of speler", "Kind onder begeleiding"];
const UNDO_REASONS = ["Bezoeker ging niet naar binnen", "Verkeerd ticket gescand", "Per ongeluk gescand"];

class NetworkError extends Error {}
class AuthError extends Error {}

async function call<T>(path: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<T> {
  const token = localStorage.getItem(LS.token);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), init?.timeoutMs ?? 6000);
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

// ── Geluid en trilling ──
// iOS speelt alleen geluid af als de AudioContext na een aanraking is gestart. Daarom één gedeelde
// context, die bij de eerste tik op het scherm wordt ontgrendeld.
let audio: AudioContext | null = null;
function unlockAudio() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audio ??= new Ctor();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    /* geluid is een extra */
  }
}
function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine") {
  if (!audio) return;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = audio.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(audio.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function signal(kind: "ok" | "warn" | "bad") {
  try {
    navigator.vibrate?.(kind === "ok" ? 80 : kind === "warn" ? [150, 100, 150] : [400, 100, 400]);
  } catch {
    /* niet elke telefoon trilt */
  }
  try {
    if (!audio) return;
    if (kind === "ok") {
      tone(880, 0, 0.09);
      tone(1320, 0.1, 0.12);
    } else if (kind === "warn") {
      tone(600, 0, 0.12, "triangle");
      tone(600, 0.18, 0.12, "triangle");
      tone(600, 0.36, 0.12, "triangle");
    } else {
      tone(170, 0, 0.5, "square");
    }
  } catch {
    /* geluid is een extra */
  }
}

/** Welke wedstrijd staat standaard aan: vandaag, anders de eerstvolgende, anders de eerste in de lijst. */
function defaultEvent(events: Ctx["events"]): string | null {
  const now = Date.now();
  const active = events.filter((e) => e.status === "ACTIVE" || !e.status);
  const today = active.find((e) => isToday(e.startsAt)) ?? events.find((e) => isToday(e.startsAt));
  if (today) return today.id;
  const next = active.filter((e) => new Date(e.endsAt).getTime() >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  return (next ?? active[0] ?? events[0])?.id ?? null;
}

export function ScannerApp() {
  const [phase, setPhase] = useState<"checking" | "login" | "ready">("checking");
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [eventIds, setEventIds] = useState<string[]>([]);
  // De eerste gekozen wedstrijd is de "hoofdwedstrijd" voor tellingen; bij meerdere wedstrijden kiest de server per scan.
  const eventId = eventIds[0] ?? "";
  const [entranceId, setEntranceId] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [result, setResult] = useState<Resp | null>(null);
  const [checking, setChecking] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [cacheInfo, setCacheInfo] = useState<{ count: number; expiresAt: string; generatedAt: string } | null>(null);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "info" | "bad" } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [torch, setTorch] = useState<{ available: boolean; on: boolean }>({ available: false, on: false });
  const [recent, setRecent] = useState<Recent[]>([]);
  const [undoFor, setUndoFor] = useState<Recent | null>(null);
  // Klok voor "vandaag"-controles, eens per minuut bijgewerkt.
  const [now, setNow] = useState(() => Date.now());
  const lastSeen = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const lastScan = useRef<{ code: string; entranceId: string | null } | null>(null);
  const resultRef = useRef<Resp | null>(null);
  const checkingRef = useRef(false);
  const syncing = useRef(false);
  const syncAgain = useRef<() => void>(() => {});
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitRef = useRef<(code: string, override?: string) => Promise<void>>(async () => {});
  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  const flash = useCallback((text: string, tone: "info" | "bad" = "info") => setMessage({ text, tone }), []);
  const addRecent = useCallback((r: Recent) => {
    setRecent((cur) => {
      const next = [r, ...cur].slice(0, 30);
      write(LS.recent, next);
      return next;
    });
  }, []);
  const patchRecent = useCallback((match: (r: Recent) => boolean, patch: Partial<Recent>) => {
    setRecent((cur) => {
      const next = cur.map((r) => (match(r) ? { ...r, ...patch } : r));
      write(LS.recent, next);
      return next;
    });
  }, []);

  // Opstarten: bestaande sessie hergebruiken (token of Hub-sessie), anders inloggen.
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/scan-sw.js", { scope: "/scan" }).catch(() => {});
    setRecent(read<Recent[]>(LS.recent, []));
    const unlock = () => unlockAudio();
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("keydown", unlock);
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
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!ctx) return;
    const sel = read<{ eventId?: string; eventIds?: string[]; entranceId?: string }>(LS.sel, {});
    const saved = (sel.eventIds ?? (sel.eventId ? [sel.eventId] : [])).filter((id) => ctx.events.some((e) => e.id === id));
    const fallback = defaultEvent(ctx.events);
    setEventIds(saved.length ? saved : fallback ? [fallback] : []);
    setEntranceId(ctx.actor.entranceId ?? (ctx.entrances.some((e) => e.id === sel.entranceId) ? sel.entranceId! : ""));
    // Eerste keer op dit toestel: meteen de keuze laten zien, zodat de steward wedstrijd en ingang controleert.
    if (!saved.length && ctx.events.length > 0) setSetupOpen(true);
  }, [ctx]);
  useEffect(() => {
    if (eventIds.length) write(LS.sel, { eventIds, entranceId });
  }, [eventIds, entranceId]);

  // Scherm aan houden zolang de scanner open staat (anders valt de camera weg bij de ingang).
  useEffect(() => {
    if (phase !== "ready") return;
    type Lock = { release: () => Promise<void> };
    let lock: Lock | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Lock> } };
    const req = () => nav.wakeLock?.request("screen").then((l) => (lock = l), () => {});
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void req();
        // iOS en Android zetten de camera stil op de achtergrond: bij terugkomen opnieuw starten.
        setCameraKey((k) => k + 1);
      }
    };
    void req();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, [phase]);

  const loadCacheInfo = useCallback((ids: string[]) => {
    const caches = ids.map((id) => read<OfflineCache | null>(LS.cache(id), null)).filter((c): c is OfflineCache => !!c && !cacheExpired(c));
    setCacheInfo(caches.length ? { count: caches.reduce((n, c) => n + c.hhc.length + c.fullhouse.length, 0), expiresAt: caches.map((c) => c.expiresAt).sort()[0], generatedAt: caches.map((c) => c.generatedAt).sort()[0] } : null);
  }, []);
  const eventKey = eventIds.join(",");

  // Offline-lijst automatisch laden en elke 10 minuten verversen (nieuwe tickets en scans van andere scanners).
  const refreshCache = useCallback(
    async (ids: string[], opts: { force?: boolean; quiet?: boolean } = {}) => {
      if (!ids.length) return;
      setCacheBusy(true);
      let total = 0;
      const failed: string[] = [];
      try {
        for (const id of ids) {
          const existing = read<OfflineCache | null>(LS.cache(id), null);
          if (!opts.force && existing && !cacheExpired(existing) && Date.now() - new Date(existing.generatedAt).getTime() < CACHE_REFRESH_MS) {
            total += existing.hhc.length + existing.fullhouse.length;
            continue;
          }
          try {
            const c = await call<OfflineCache>(`/api/scan/cache?eventId=${id}`, { timeoutMs: 30_000 });
            write(LS.cache(id), c);
            total += c.hhc.length + c.fullhouse.length;
          } catch (e) {
            if (e instanceof NetworkError) {
              setOnline(false);
              break;
            }
            failed.push(`${ctx?.events.find((x) => x.id === id)?.title ?? id}: ${e instanceof Error ? e.message : "mislukt"}`);
          }
        }
      } finally {
        setCacheBusy(false);
        loadCacheInfo(ids);
      }
      if (!opts.quiet) flash(failed.length ? `Offline-lijst deels geladen (${total} tickets). Niet gelukt: ${failed.join(" · ")}` : `Offline-lijst bijgewerkt: ${total} tickets.`, failed.length ? "bad" : "info");
    },
    [ctx, flash, loadCacheInfo],
  );
  useEffect(() => {
    if (!eventKey) return;
    const ids = eventKey.split(",");
    loadCacheInfo(ids);
    if (phase !== "ready") return;
    void refreshCache(ids, { quiet: true });
    const t = setInterval(() => void refreshCache(ids, { quiet: true }), CACHE_REFRESH_MS);
    return () => clearInterval(t);
  }, [eventKey, phase, loadCacheInfo, refreshCache]);

  // Terugmelden van offline scans. Kleine porties met ruime wachttijd, en nooit twee tegelijk.
  const sync = useCallback(async () => {
    const queue = read<Queued[]>(LS.queue, []);
    setPending(queue.length);
    if (queue.length === 0 || syncing.current) return;
    syncing.current = true;
    try {
      const batch = queue.slice(0, 25);
      const res = await call<{ results: { clientId: string; result: string; reasonLabel?: string | null }[]; rejected?: { clientId: string; error: string }[] }>("/api/scan/sync", {
        body: { scans: batch.map(({ key: _k, local: _l, ...s }) => s) },
        timeoutMs: 45_000,
      });
      const done = new Set([...res.results.map((r) => r.clientId), ...(res.rejected ?? []).map((r) => r.clientId)]);
      // Offline toegelaten, maar de server zegt nee (bijvoorbeeld: al binnen via een andere ingang). Zichtbaar maken.
      let conflicts = 0;
      for (const r of res.results) {
        const q = batch.find((b) => b.clientId === r.clientId);
        if (q?.local === "VALID" && r.result !== "VALID") {
          conflicts++;
          patchRecent((x) => x.id === r.clientId, { conflict: r.reasonLabel ?? (r.result === "WARNING" ? "Al gebruikt" : "Niet geldig") });
        }
      }
      for (const r of res.rejected ?? []) patchRecent((x) => x.id === r.clientId, { conflict: r.error });
      const rest = read<Queued[]>(LS.queue, []).filter((q) => !done.has(q.clientId));
      write(LS.queue, rest);
      setPending(rest.length);
      setOnline(true);
      if (conflicts) flash(`${conflicts} offline toegelaten ${conflicts === 1 ? "ticket bleek" : "tickets bleken"} achteraf niet geldig. Zie "Laatste scans".`, "bad");
      if (res.rejected?.length) flash(`${res.rejected.length} offline ${res.rejected.length === 1 ? "scan kon" : "scans konden"} niet worden verwerkt: ${res.rejected[0].error}`, "bad");
      if (rest.length && rest.length < queue.length) setTimeout(() => syncAgain.current(), 500);
    } catch (e) {
      if (e instanceof NetworkError) setOnline(false);
    } finally {
      syncing.current = false;
    }
  }, [flash, patchRecent]);
  useEffect(() => {
    syncAgain.current = () => void sync();
  }, [sync]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (phase !== "ready") return;
    void sync();
    const t = setInterval(() => void sync(), 20000);
    const on = () => {
      setOnline(true);
      void sync();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
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

  const remember = (evId: string | undefined, key: string | null, at: string) => {
    if (!evId || !key) return;
    write(LS.seen(evId), { ...read<Record<string, string>>(LS.seen(evId), {}), [key]: at });
  };

  const submit = useCallback(
    async (code: string, override?: string) => {
      if (!eventId || !code.trim() || checkingRef.current) return;
      checkingRef.current = true;
      setChecking(true);
      setMessage(null);
      const entr = entranceId || null;
      lastScan.current = { code, entranceId: entr };
      const clientId = newId();
      const scannedAt = new Date().toISOString();
      const isHhc = !!parseHhcCode(code);
      let r: Resp;
      try {
        try {
          // Weet de telefoon al dat er geen netwerk is, dan niet eerst 6 seconden wachten.
          if (typeof navigator !== "undefined" && navigator.onLine === false) throw new NetworkError("Geen verbinding");
          r = await call<Resp>("/api/scan/scan", { body: { eventId, ...(eventIds.length > 1 ? { eventIds } : {}), code, entranceId: entr, clientId, ...(override ? { override: { reason: override } } : {}) } });
          setOnline(true);
          if (r.result === "VALID") remember(r.eventId, isHhc ? parseHhcCode(code)!.publicId : r.byNumber ? ticketNumberFrom(code) : await sha256(code), scannedAt);
        } catch (e) {
          if (e instanceof AuthError) {
            localStorage.removeItem(LS.token);
            flash("Je scannersessie is verlopen. Log opnieuw in; scans die nog terug moeten blijven bewaard.", "bad");
            setPhase("login");
            return;
          }
          if (!(e instanceof NetworkError)) {
            r = { result: "ERROR", reasonLabel: e instanceof Error ? e.message : "Er ging iets mis.", reentry: false, label: null, previous: null, overridable: false };
          } else {
            setOnline(false);
            if (override) {
              flash("Toelaten door een supervisor kan alleen met verbinding.", "bad");
              signal("bad");
              return;
            }
            const caches = eventIds.map((id) => ({ id, cache: read<OfflineCache | null>(LS.cache(id), null) })).filter((x): x is { id: string; cache: OfflineCache } => !!x.cache);
            if (!caches.length) {
              r = { result: "ERROR", reasonLabel: "Geen verbinding, en er is geen offline-lijst geladen voor deze wedstrijd. Laad de lijst zodra er weer bereik is.", reentry: false, label: null, previous: null, overridable: false, offline: true };
            } else {
              const hash = isHhc ? null : await sha256(code);
              const queue = read<Queued[]>(LS.queue, []);
              const zone = ctx?.entrances.find((x) => x.id === entr)?.zoneId ?? null;
              const usedFor = (id: string) => {
                const m = new Map<string, string>(Object.entries(read<Record<string, string>>(LS.seen(id), {})));
                for (const q of queue) if (q.key && q.eventId === id && q.local === "VALID") m.set(q.key, q.scannedAt);
                return m;
              };
              const opts = { allowNumber: !!ctx?.actor.canOverride };
              // Bij meerdere wedstrijden: de eerste lijst waar het ticket in staat, anders de eerste lijst.
              let matched = caches[0].id;
              let o = checkOffline(caches[0].cache, code, hash, usedFor(caches[0].id), zone, new Date(), opts);
              for (const { id, cache } of caches) {
                const res = checkOffline(cache, code, hash, usedFor(id), zone, new Date(), opts);
                if (res.result !== "INVALID" || res.reason !== "NOT_FOUND") {
                  matched = id;
                  o = res;
                  break;
                }
              }
              if (o.result === "INVALID" && o.reason === "NUMBER_NOT_ALLOWED") {
                r = { result: "ERROR", reasonLabel: "Inchecken op ticketnummer kan alleen een supervisor. Scan de QR-code of roep een supervisor.", reentry: false, label: null, previous: null, overridable: false, offline: true };
              } else {
                const key = o.key ?? scanKey(code, hash);
                write(LS.queue, [...queue, { clientId, eventId: matched, code, entranceId: entr, scannedAt, offline: true, key, local: o.result } satisfies Queued]);
                setPending(queue.length + 1);
                if (o.result === "VALID") remember(matched, o.key, scannedAt);
                const reasonLabel =
                  o.result === "WARNING" ? "Ticket is al gebruikt" : o.reason === "NOT_FOUND" ? "Ticket staat niet in de offline-lijst" : o.reason === "WRONG_ZONE" ? "Ticket hoort bij een ander vak dan deze ingang" : o.reason === "EVENT_NOT_ACTIVE" ? "Offline-lijst is verlopen" : null;
                r = { result: o.result, reasonLabel, reentry: o.reentry, label: o.label, previous: o.result !== "INVALID" && o.previousAt ? { at: o.previousAt, where: null } : null, overridable: false, offline: true, eventId: matched };
              }
            }
          }
        }
        setResult(r);
        signal(r.result === "VALID" ? "ok" : r.result === "WARNING" ? "warn" : "bad");
        addRecent({ id: clientId, scanId: r.scanId, at: scannedAt, result: r.result, label: r.label, reason: r.result === "VALID" ? (r.reentry ? "Opnieuw binnen" : null) : r.reasonLabel, eventId: r.eventId ?? eventId, key: null, offline: !!r.offline });
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        if (r.result === "VALID") dismissTimer.current = setTimeout(() => setResult(null), 1600);
      } finally {
        checkingRef.current = false;
        setChecking(false);
      }
    },
    [eventId, eventIds, entranceId, ctx, flash, addRecent],
  );
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  // Camera + QR-herkenning. Start niet opnieuw bij een andere wedstrijd- of ingangkeuze (submit via ref).
  const hasEvent = !!eventId;
  useEffect(() => {
    if (phase !== "ready" || !hasEvent) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const g = canvas.getContext("2d", { willReadFrequently: true });
    type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    let detector: Detector | null = null;
    try {
      detector = BD ? new BD({ formats: ["qr_code", "code_128", "ean_13", "itf"] }) : null;
    } catch {
      detector = null;
    }
    let last = 0;
    const handle = (raw: string) => {
      const now = Date.now();
      const same = raw === lastSeen.current.code;
      // Zolang een uitslag in beeld is of dezelfde code nog voor de camera blijft, niet opnieuw scannen:
      // anders krijgt iemand die net "GELDIG" kreeg meteen "AL GEBRUIKT" omdat hij zijn telefoon nog omhoog houdt.
      if (resultRef.current || checkingRef.current || (same && now - lastSeen.current.at < SAME_CODE_QUIET_MS)) {
        if (same) lastSeen.current.at = now;
        return;
      }
      lastSeen.current = { code: raw, at: now };
      void submitRef.current(raw);
    };
    const tick = async () => {
      if (stopped) return;
      raf = requestAnimationFrame(() => void tick());
      const v = videoRef.current;
      const now = performance.now();
      if (!v || v.readyState < 2 || now - last < 120) return;
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
          const q = jsQR(img.data, w, h, { inversionAttempts: "attemptBoth" });
          if (q?.data) handle(q.data);
        }
      } catch {
        /* een mislukt beeld is geen fout */
      }
    };
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Deze browser geeft geen toegang tot de camera. Open de scanner in Safari (iPhone) of Chrome (Android), of typ de code hieronder.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const track = s.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch({ available: !!caps.torch, on: false });
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => {});
        }
        setCameraError(null);
        raf = requestAnimationFrame(() => void tick());
      })
      .catch((err: { name?: string }) =>
        setCameraError(
          err?.name === "NotAllowedError"
            ? "Geen toegang tot de camera. Sta de camera toe in de instellingen van je browser en herlaad de pagina, of typ de code hieronder."
            : "De camera is niet beschikbaar (misschien in gebruik door een andere app). Typ de code hieronder of herlaad de pagina.",
        ),
      );
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      trackRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [phase, hasEvent, cameraKey]);

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch({ available: true, on });
    } catch {
      setTorch({ available: false, on: false });
    }
  }

  async function undo(item: Recent, reason: string) {
    if (!item.scanId) return;
    try {
      await call("/api/scan/undo", { body: { scanId: item.scanId, reason } });
      patchRecent((r) => r.id === item.id, { result: "VOIDED", reason: `Ongedaan: ${reason}` });
      // Het ticket mag weer naar binnen: ook lokaal vergeten.
      if (item.eventId) {
        const seen = read<Record<string, string>>(LS.seen(item.eventId), {});
        const used = Object.entries(seen).filter(([, at]) => at === item.at);
        for (const [k] of used) delete seen[k];
        write(LS.seen(item.eventId), seen);
      }
      flash("Scan ongedaan gemaakt. Het ticket kan opnieuw gescand worden.");
      setUndoFor(null);
    } catch (e) {
      if (e instanceof NetworkError) flash("Ongedaan maken kan alleen met verbinding.", "bad");
      else flash(e instanceof Error ? e.message : "Ongedaan maken mislukt.", "bad");
    }
  }

  async function logout() {
    const queue = read<Queued[]>(LS.queue, []);
    if (queue.length && !window.confirm(`Er ${queue.length === 1 ? "staat nog 1 scan" : `staan nog ${queue.length} scans`} klaar om terug te melden. Die blijven op dit toestel bewaard en worden na het inloggen verstuurd. Toch uitloggen?`)) return;
    localStorage.removeItem(LS.token);
    if (ctx?.actor.kind === "user") window.location.href = "/";
    else {
      setCtx(null);
      setSetupOpen(false);
      setPhase("login");
    }
  }

  if (phase === "checking") return <p className="p-8 text-center text-neutral-400">Laden…</p>;
  if (phase === "login") return <Login notice={message?.text ?? null} onDone={(c) => (setMessage(null), setCtx(c), setPhase("ready"))} />;
  if (!ctx) return null;

  const selected = eventIds.map((id) => ctx.events.find((e) => e.id === id)).filter((e): e is Ctx["events"][number] => !!e);
  const notToday = selected.length > 0 && !selected.some((e) => isToday(e.startsAt) || (new Date(e.startsAt).getTime() <= now && new Date(e.endsAt).getTime() >= now));
  const entrance = ctx.entrances.find((e) => e.id === entranceId) ?? null;
  const needsEntrance = ctx.entrances.length > 0 && !entrance;
  const admittedHere = recent.filter((r) => r.result === "VALID" && eventIds.includes(r.eventId ?? "")).length;
  const conflicts = recent.filter((r) => r.conflict).length;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col pb-[env(safe-area-inset-bottom)]">
      <header className="flex items-center justify-between gap-2 bg-[#f26a21] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-black">
        <div className="min-w-0">
          <p className="text-base font-black leading-tight">HHC Scanner</p>
          <p className="truncate text-xs font-medium">{ctx.actor.name}{ctx.actor.canOverride ? " · supervisor" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${online ? "bg-black/15" : "bg-black text-white"}`} role="status">
            {online ? <span className="h-2 w-2 rounded-full bg-green-800" aria-hidden /> : <WifiOff className="h-3.5 w-3.5" aria-hidden />}
            {online ? "Online" : "Offline"}
          </span>
          <button onClick={() => setSetupOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/15" aria-label="Wedstrijd, ingang en uitloggen">
            <Settings className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      {ctx.events.length === 0 ? (
        <p className="p-6 text-center text-neutral-300">Er is nu geen wedstrijd om te scannen. Vraag een beheerder om de wedstrijd in HHC Tickets aan te zetten.</p>
      ) : (
        <>
          <button onClick={() => setSetupOpen(true)} className="mx-4 mt-3 flex items-center gap-3 rounded-xl bg-neutral-900 p-3 text-left">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{selected.length ? selected.map((e) => e.title).join(" + ") : "Kies een wedstrijd"}</p>
              <p className="truncate text-xs text-neutral-400">
                {selected[0] ? (isToday(selected[0].startsAt) ? `Vandaag ${timeOf(selected[0].startsAt)}` : formatDayTime(selected[0].startsAt)) : ""}
                {" · "}
                {entrance ? `Ingang ${entrance.name}` : ctx.entrances.length ? "Geen ingang gekozen" : "Alle ingangen"}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-neutral-500" aria-hidden />
          </button>
          {(notToday || needsEntrance) && (
            <div className="mx-4 mt-2 space-y-1 rounded-xl bg-amber-400 p-3 text-sm font-medium text-black">
              {notToday && <p>Let op: de gekozen wedstrijd is niet vandaag. Klopt dat?</p>}
              {needsEntrance && <p>Kies je ingang, dan controleert de scanner ook of het ticket bij dit vak hoort.</p>}
            </div>
          )}

          <div className="relative mx-4 mt-3 aspect-square overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-[12%]" aria-hidden>
              <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-xl border-l-4 border-t-4 border-white/80" />
              <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-xl border-r-4 border-t-4 border-white/80" />
              <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-xl border-b-4 border-l-4 border-white/80" />
              <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-xl border-b-4 border-r-4 border-white/80" />
            </div>
            {checking && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-lg font-semibold" role="status">
                <Loader2 className="h-10 w-10 animate-spin" aria-hidden />
                Controleren…
              </div>
            )}
            {cameraError && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-neutral-200">{cameraError}</p>}
            {torch.available && (
              <button onClick={toggleTorch} className={`absolute bottom-3 right-3 flex h-12 w-12 items-center justify-center rounded-full ${torch.on ? "bg-white text-black" : "bg-black/60 text-white"}`} aria-label={torch.on ? "Lamp uit" : "Lamp aan"} aria-pressed={torch.on}>
                {torch.on ? <Flashlight className="h-6 w-6" aria-hidden /> : <FlashlightOff className="h-6 w-6" aria-hidden />}
              </button>
            )}
          </div>

          <div className="mx-4 mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-neutral-800 px-2.5 py-1">Deze telefoon: {admittedHere} binnen</span>
            {stats && <span className="rounded-full bg-neutral-800 px-2.5 py-1">Totaal binnen: {stats.inside}</span>}
            {pending > 0 && <span className="rounded-full bg-amber-400 px-2.5 py-1 font-semibold text-black">{pending} nog terug te melden</span>}
          </div>

          <form
            className="flex gap-2 px-4 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget.elements.namedItem("code") as HTMLInputElement;
              const v = f.value.trim();
              if (!v) return;
              void submit(v);
              f.value = "";
            }}
          >
            <label className="sr-only" htmlFor="scan-code">Code of ticketnummer</label>
            <input
              id="scan-code"
              name="code"
              autoComplete="off"
              autoCapitalize="characters"
              enterKeyHint="go"
              placeholder={ctx.actor.canOverride ? "Ticketnummer of code typen" : "Code typen of handscanner"}
              className="min-w-0 flex-1 rounded-xl bg-neutral-800 p-3 text-base text-white placeholder:text-neutral-500"
            />
            <button disabled={checking} className="rounded-xl bg-[#f26a21] px-4 text-base font-semibold text-black disabled:opacity-50">Controleer</button>
          </form>

          {message && (
            <p className={`mx-4 mt-3 rounded-xl p-3 text-sm ${message.tone === "bad" ? "bg-red-900 text-white" : "bg-neutral-800 text-neutral-100"}`} role="status">
              {message.text}
            </p>
          )}

          <section className="mx-4 mt-4" aria-label="Laatste scans">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-300">Laatste scans</h2>
              {conflicts > 0 && <span className="rounded-full bg-red-700 px-2 py-0.5 text-xs font-semibold">{conflicts} achteraf afgekeurd</span>}
            </div>
            {recent.length === 0 ? (
              <p className="text-xs text-neutral-500">Nog niets gescand op deze telefoon.</p>
            ) : (
              <ul className="divide-y divide-neutral-800 rounded-xl bg-neutral-900">
                {recent.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 p-3 text-sm">
                    <ResultDot result={r.conflict ? "INVALID" : r.result} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-medium ${r.result === "VOIDED" ? "text-neutral-500 line-through" : ""}`}>{r.label ?? (r.result === "ERROR" ? "Melding" : "Onbekend ticket")}</p>
                      <p className="truncate text-xs text-neutral-400">
                        {timeOf(r.at)}
                        {r.reason ? ` · ${r.reason}` : ""}
                        {r.offline ? " · offline" : ""}
                      </p>
                      {r.conflict && <p className="text-xs font-semibold text-red-400">Achteraf: {r.conflict}</p>}
                    </div>
                    {r.result === "VALID" && r.scanId && !r.offline && (
                      <button onClick={() => setUndoFor(r)} className="flex shrink-0 items-center gap-1 rounded-lg bg-neutral-800 px-2.5 py-2 text-xs" aria-label={`Scan van ${timeOf(r.at)} ongedaan maken`}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Ongedaan
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="mx-4 mb-6 mt-4 flex items-center justify-between gap-2 rounded-xl bg-neutral-900 p-3 text-xs text-neutral-400">
            <span>
              {cacheInfo ? `Offline-lijst: ${cacheInfo.count} tickets, bijgewerkt ${timeOf(cacheInfo.generatedAt)}. Wordt automatisch ververst.` : online ? "Offline-lijst wordt geladen…" : "Geen offline-lijst op deze telefoon."}
            </span>
            <button onClick={() => void refreshCache(eventIds, { force: true })} disabled={cacheBusy || !online} className="shrink-0 rounded-lg bg-neutral-800 px-3 py-2 text-white disabled:opacity-50">
              {cacheBusy ? "Bezig…" : "Vernieuw"}
            </button>
          </div>
        </>
      )}

      {setupOpen && (
        <Setup
          now={now}
          ctx={ctx}
          eventIds={eventIds}
          entranceId={entranceId}
          onEvents={setEventIds}
          onEntrance={setEntranceId}
          onClose={() => setSetupOpen(false)}
          onLogout={logout}
        />
      )}

      {result && (
        <ResultScreen
          result={result}
          multi={eventIds.length > 1}
          eventTitle={ctx.events.find((x) => x.id === result.eventId)?.title ?? null}
          overrideOpen={overrideOpen}
          overrideReason={overrideReason}
          onOverrideOpen={() => setOverrideOpen(true)}
          onOverrideReason={setOverrideReason}
          onOverride={() => {
            const l = lastScan.current;
            const reason = overrideReason.trim();
            dismiss();
            if (l) void submit(l.code, reason);
          }}
          onDismiss={dismiss}
        />
      )}

      {undoFor && <UndoDialog item={undoFor} onCancel={() => setUndoFor(null)} onConfirm={(reason) => void undo(undoFor, reason)} />}
    </div>
  );
}

function ResultDot({ result }: { result: Recent["result"] }) {
  const cls = result === "VALID" ? "bg-green-500" : result === "WARNING" ? "bg-amber-400" : result === "VOIDED" ? "bg-neutral-600" : "bg-red-500";
  const label = result === "VALID" ? "Geldig" : result === "WARNING" ? "Waarschuwing" : result === "VOIDED" ? "Ongedaan" : "Niet geldig";
  return <span className={`h-3 w-3 shrink-0 rounded-full ${cls}`} role="img" aria-label={label} />;
}

function ResultScreen(props: {
  result: Resp;
  multi: boolean;
  eventTitle: string | null;
  overrideOpen: boolean;
  overrideReason: string;
  onOverrideOpen: () => void;
  onOverrideReason: (v: string) => void;
  onOverride: () => void;
  onDismiss: () => void;
}) {
  const { result: r } = props;
  const ok = r.result === "VALID";
  const warn = r.result === "WARNING";
  // Oranje met zwarte tekst (wit op oranje is slecht leesbaar in de zon).
  const tone = ok ? "bg-green-600 text-white" : warn ? "bg-amber-400 text-black" : r.result === "ERROR" ? "bg-neutral-800 text-white" : "bg-red-600 text-white";
  const title = ok ? (r.reentry ? "OPNIEUW BINNEN" : "GELDIG") : warn ? "AL GEBRUIKT" : r.result === "ERROR" ? "NIET GECONTROLEERD" : "NIET GELDIG";
  const Icon = ok ? Check : warn ? AlertTriangle : X;
  const subtle = warn ? "bg-black/10" : "bg-black/25";
  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center ${tone}`} onClick={ok ? props.onDismiss : undefined} role="alert" aria-live="assertive">
      <span className={`flex h-24 w-24 items-center justify-center rounded-full ${warn ? "bg-black text-amber-400" : "bg-white/95"} ${ok ? "text-green-700" : r.result === "INVALID" ? "text-red-600" : r.result === "ERROR" ? "text-neutral-800" : ""}`} aria-hidden>
        <Icon className="h-16 w-16" strokeWidth={3} />
      </span>
      <p className="text-5xl font-black tracking-tight">{title}</p>
      {r.label && <p className="text-2xl font-semibold">{r.label}</p>}
      {r.zone && <p className={`rounded-full px-4 py-1 text-xl font-bold ${subtle}`}>Vak {r.zone}</p>}
      {r.reasonLabel && !ok && <p className="max-w-sm text-xl font-medium">{r.reasonLabel}</p>}
      {r.detail && <p className="max-w-sm text-lg">{r.detail}</p>}
      {r.previous && (
        <p className="text-lg">
          {ok ? "Eerder binnen" : "Eerder gescand"} om {isToday(r.previous.at) ? timeOf(r.previous.at) : formatDayTime(r.previous.at)}
          {r.previous.where ? ` bij ${r.previous.where}` : ""}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2 text-sm">
        {props.multi && props.eventTitle && <span className={`rounded-full px-3 py-1 ${subtle}`}>{props.eventTitle}</span>}
        {r.overridden && <span className={`rounded-full px-3 py-1 ${subtle}`}>Door supervisor toegelaten</span>}
        {r.byNumber && <span className={`rounded-full px-3 py-1 ${subtle}`}>Op ticketnummer</span>}
        {r.offline && r.result !== "ERROR" && <span className={`rounded-full px-3 py-1 ${subtle}`}>Offline gecontroleerd, wordt later nagekeken</span>}
      </div>
      {ok && <p className="mt-2 text-sm opacity-80">Tik om meteen verder te scannen</p>}
      {!ok && (
        <div className="mt-3 flex w-full max-w-xs flex-col gap-2">
          {r.overridable && !props.overrideOpen && (
            <button onClick={props.onOverrideOpen} className="rounded-xl bg-white p-3 font-semibold text-black">
              Toch toelaten (supervisor)
            </button>
          )}
          {props.overrideOpen && (
            <div className={`space-y-2 rounded-xl p-3 text-left ${subtle}`}>
              <p className="text-sm font-semibold">Waarom laat je toe? Dit komt in het logboek.</p>
              <div className="flex flex-wrap gap-1.5">
                {OVERRIDE_REASONS.map((x) => (
                  <button key={x} type="button" onClick={() => props.onOverrideReason(x)} className={`rounded-full px-3 py-1.5 text-sm ${props.overrideReason === x ? "bg-white text-black" : "bg-black/30 text-white"}`}>
                    {x}
                  </button>
                ))}
              </div>
              <input value={props.overrideReason} onChange={(e) => props.onOverrideReason(e.target.value)} placeholder="Of typ een reden" className="w-full rounded-lg p-2.5 text-base text-black" aria-label="Reden" />
              <button disabled={props.overrideReason.trim().length < 3} onClick={props.onOverride} className="w-full rounded-lg bg-white p-3 font-semibold text-black disabled:opacity-50">
                Laat toe
              </button>
            </div>
          )}
          <button onClick={props.onDismiss} className={`rounded-xl p-4 text-lg font-bold ${warn ? "bg-black text-white" : "bg-black/40"}`} autoFocus>
            Volgende scan
          </button>
        </div>
      )}
    </div>
  );
}

function Setup(props: { now: number; ctx: Ctx; eventIds: string[]; entranceId: string; onEvents: (f: (cur: string[]) => string[]) => void; onEntrance: (id: string) => void; onClose: () => void; onLogout: () => void }) {
  const { ctx, now } = props;
  const today = ctx.events.filter((e) => isToday(e.startsAt));
  const upcoming = ctx.events.filter((e) => !isToday(e.startsAt) && new Date(e.startsAt).getTime() > now);
  const other = ctx.events.filter((e) => !today.includes(e) && !upcoming.includes(e));
  const group = (title: string, list: Ctx["events"]) =>
    list.length > 0 && (
      <div>
        <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>
        <ul className="divide-y divide-neutral-800 rounded-xl bg-neutral-900">
          {list.map((e) => {
            const on = props.eventIds.includes(e.id);
            return (
              <li key={e.id}>
                <label className="flex min-h-14 items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(ev) => props.onEvents((cur) => (ev.target.checked ? [...cur, e.id] : cur.length > 1 ? cur.filter((x) => x !== e.id) : cur))}
                    className="h-5 w-5 accent-[#f26a21]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{e.title}</span>
                    <span className="block text-xs text-neutral-400">
                      {isToday(e.startsAt) ? `Vandaag ${timeOf(e.startsAt)}` : formatDayTime(e.startsAt)}
                      {e.status && e.status !== "ACTIVE" ? ` · ${e.status === "DRAFT" ? "concept" : "afgesloten"}` : ""}
                      {e.source === "FULLHOUSE" || e.externalId ? " · Fullhouse" : ""}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    );
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-neutral-950" role="dialog" aria-modal="true" aria-label="Wedstrijd en ingang kiezen">
      <div className="mx-auto max-w-md px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Wat scan je?</h2>
          <button onClick={props.onClose} className="rounded-xl bg-[#f26a21] px-5 py-2.5 font-semibold text-black">Klaar</button>
        </div>
        <p className="mt-1 text-sm text-neutral-400">Kies de wedstrijd. Bij een dubbele wedstrijddag kun je er meer kiezen; de scanner kijkt dan zelf bij welke wedstrijd het ticket hoort.</p>
        {group("Vandaag", today)}
        {group("Komende wedstrijden", upcoming)}
        {group("Eerder en seizoenspassen", other)}

        <h3 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-wide text-neutral-400">Ingang</h3>
        {ctx.actor.entranceId ? (
          <p className="rounded-xl bg-neutral-900 p-3 text-sm">Deze scanner hoort vast bij ingang {ctx.entrances.find((e) => e.id === ctx.actor.entranceId)?.name ?? "?"}.</p>
        ) : ctx.entrances.length === 0 ? (
          <p className="rounded-xl bg-neutral-900 p-3 text-sm text-neutral-400">Er zijn geen ingangen ingesteld; alle tickets gelden bij elke ingang.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-xl bg-neutral-900">
            {[{ id: "", name: "Geen vaste ingang (vak niet controleren)" }, ...ctx.entrances].map((e) => (
              <li key={e.id}>
                <label className="flex min-h-12 items-center gap-3 p-3">
                  <input type="radio" name="entrance" checked={props.entranceId === e.id} onChange={() => props.onEntrance(e.id)} className="h-5 w-5 accent-[#f26a21]" />
                  <span>{e.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <button onClick={props.onLogout} className="mt-8 w-full rounded-xl bg-neutral-800 p-3 text-sm font-semibold">
          Uitloggen ({ctx.actor.name})
        </button>
      </div>
    </div>
  );
}

function UndoDialog({ item, onCancel, onConfirm }: { item: Recent; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Scan ongedaan maken">
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-neutral-900 p-4">
        <h2 className="text-lg font-bold">Scan ongedaan maken?</h2>
        <p className="text-sm text-neutral-300">
          {item.label ?? "Ticket"} · {timeOf(item.at)}. Het ticket telt daarna weer als niet gebruikt. Dit komt met je reden in het logboek.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {UNDO_REASONS.map((x) => (
            <button key={x} type="button" onClick={() => setReason(x)} className={`rounded-full px-3 py-1.5 text-sm ${reason === x ? "bg-white text-black" : "bg-neutral-800"}`}>
              {x}
            </button>
          ))}
        </div>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Of typ een reden" className="w-full rounded-lg bg-neutral-800 p-2.5 text-base" aria-label="Reden" />
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl bg-neutral-800 p-3 font-semibold">Annuleren</button>
          <button
            disabled={busy || reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              await onConfirm(reason.trim());
              setBusy(false);
            }}
            className="flex-1 rounded-xl bg-[#f26a21] p-3 font-semibold text-black disabled:opacity-50"
          >
            Ongedaan maken
          </button>
        </div>
      </div>
    </div>
  );
}

function Login({ onDone, notice }: { onDone: (c: Ctx) => void; notice: string | null }) {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    unlockAudio();
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
      setError(err instanceof TypeError ? "Geen verbinding. Inloggen kan alleen met internet." : err instanceof Error ? err.message : "Inloggen mislukt.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={go} className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-black">HHC Scanner</h1>
      <p className="text-sm text-neutral-400">Log in met de code en PIN van je scanner. Heb je een Hub-account met scanrechten? Log dan in met je Hub-account.</p>
      {notice && <p className="rounded-xl bg-amber-400 p-3 text-sm font-medium text-black">{notice}</p>}
      <label className="text-sm text-neutral-300">
        Scannercode
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" className="mt-1 w-full rounded-xl bg-neutral-800 p-3 text-lg tracking-widest text-white" />
      </label>
      <label className="text-sm text-neutral-300">
        PIN
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" type="password" autoComplete="off" className="mt-1 w-full rounded-xl bg-neutral-800 p-3 text-lg tracking-widest text-white" />
      </label>
      {error && <p className="rounded-xl bg-red-900 p-3 text-sm" role="alert">{error}</p>}
      <button disabled={busy || code.length < 3 || pin.length < 4} className="rounded-xl bg-[#f26a21] p-3 text-lg font-semibold text-black disabled:opacity-50">
        {busy ? "Bezig…" : "Inloggen"}
      </button>
      <a href="/login?callbackUrl=/scan" className="text-center text-sm text-neutral-400 underline">
        Inloggen met Hub-account
      </a>
    </form>
  );
}
