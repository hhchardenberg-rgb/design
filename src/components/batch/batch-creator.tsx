"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface BatchTemplate {
  id: string;
  name: string;
  category: string;
  familyKey: string | null;
  formatLabel: string;
  exportFormats: string[];
}

interface BatchMatch {
  id: string;
  date: string;
  label: string;
  isHome: boolean;
}

interface BatchPlayer {
  id: string;
  name: string;
  team: string;
  hasPhoto: boolean;
}

export interface BatchView {
  id: string;
  title: string;
  format: string;
  status: string;
  error: string | null;
  zip: { url: string; bytes: number | null } | null;
  createdAt: string;
  items: { id: string; label: string; status: string; error: string | null; designId: string | null }[];
}

const MAX_ITEMS = 60;
const FORMATS = ["PNG", "JPG", "WEBP"];

const dateText = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" })
    .format(new Date(iso))
    .replace(/-/g, "/");

const sizeText = (bytes: number | null) => (bytes ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : "");

export function BatchCreator({
  templates,
  matches,
  players,
  initialBatches,
}: {
  templates: BatchTemplate[];
  matches: BatchMatch[];
  players: BatchPlayer[];
  initialBatches: BatchView[];
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const template = templates.find((t) => t.id === templateId);
  const family = useMemo(
    () => (template?.familyKey ? templates.filter((t) => t.familyKey === template.familyKey) : template ? [template] : []),
    [template, templates]
  );
  const [formatIds, setFormatIds] = useState<string[]>(templateId ? [templateId] : []);
  const [source, setSource] = useState<"match" | "player">("match");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("PNG");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<BatchView[]>(initialBatches);

  const chosenTemplates = family.filter((t) => formatIds.includes(t.id));
  const allowedFormats = FORMATS.filter((f) => chosenTemplates.every((t) => t.exportFormats.includes(f)));
  const total = chosenTemplates.length * selected.length;

  function pickTemplate(id: string) {
    setTemplateId(id);
    setFormatIds([id]);
  }

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (source === "match") {
      return matches
        .filter((m) => !q || m.label.toLowerCase().includes(q))
        .map((m) => ({ id: m.id, label: m.label, meta: `${dateText(m.date)} · ${m.isHome ? "thuis" : "uit"}`, group: "" }));
    }
    return players
      .filter((p) => !q || `${p.name} ${p.team}`.toLowerCase().includes(q))
      .map((p) => ({ id: p.id, label: p.name, meta: p.hasPhoto ? "" : "geen foto", group: p.team }));
  }, [source, matches, players, query]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateIds: chosenTemplates.map((t) => t.id), source, sourceIds: selected, format }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Starten is niet gelukt.");
      setBatches((b) => [
        { id: data.batch.id, title: "Wordt gestart…", format, status: "QUEUED", error: null, zip: null, createdAt: new Date().toISOString(), items: [] },
        ...b,
      ]);
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Starten is niet gelukt.");
    } finally {
      setCreating(false);
    }
  }

  const updateBatch = useCallback((next: BatchView) => setBatches((b) => b.map((x) => (x.id === next.id ? next : x))), []);

  if (templates.length === 0) {
    return <p className="text-sm text-muted-foreground">Er zijn nog geen gepubliceerde templates.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <Card>
        <CardContent className="flex flex-col gap-5 p-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">1. Template</span>
            <Select value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.formatLabel})
                </option>
              ))}
            </Select>
            {family.length > 1 && (
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="text-muted-foreground">Formaten:</span>
                {family.map((t) => (
                  <label key={t.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="accent-hhc-orange"
                      checked={formatIds.includes(t.id)}
                      onChange={() => setFormatIds((ids) => (ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id]))}
                    />
                    {t.formatLabel}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">2. Voor wie of wat</span>
              <div className="flex gap-1">
                {(["match", "player"] as const).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={source === s ? "primary" : "outline"}
                    onClick={() => {
                      setSource(s);
                      setSelected([]);
                      setQuery("");
                    }}
                  >
                    {s === "match" ? "Wedstrijden" : "Spelers"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Zoeken..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{selected.length} gekozen</span>
              <span className="flex gap-3">
                <button type="button" className="hover:underline" onClick={() => setSelected([...new Set([...selected, ...list.map((i) => i.id)])])}>
                  Alles kiezen
                </button>
                <button type="button" className="hover:underline" onClick={() => setSelected([])}>
                  Niets
                </button>
              </span>
            </div>
            <div className="max-h-[420px] overflow-y-auto rounded-md border border-border">
              {list.length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  {source === "match" ? "Geen wedstrijden gevonden (afgelopen twee weken en later)." : "Geen spelers gevonden."}
                </p>
              )}
              {list.map((item, n) => {
                const header = item.group && item.group !== list[n - 1]?.group ? item.group : null;
                return (
                  <div key={item.id}>
                    {header && <p className="bg-surface-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{header}</p>}
                    <label className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-surface-muted">
                      <input type="checkbox" className="accent-hhc-orange" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
                      <span className="flex-1">{item.label}</span>
                      {item.meta && <span className="text-xs text-muted-foreground">{item.meta}</span>}
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select value={allowedFormats.includes(format) ? format : allowedFormats[0] ?? ""} onChange={(e) => setFormat(e.target.value)} className="w-28">
              {allowedFormats.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
            <Button
              onClick={create}
              disabled={creating || total === 0 || total > MAX_ITEMS || allowedFormats.length === 0}
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {total === 1 ? "Maak 1 afbeelding" : `Maak ${total} afbeeldingen`}
            </Button>
            {total > MAX_ITEMS && <span className="text-xs text-destructive">Maximaal {MAX_ITEMS} per keer.</span>}
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recente batches</h2>
        {batches.length === 0 && <p className="text-sm text-muted-foreground">Nog geen batches.</p>}
        {batches.map((b) => (
          <BatchCard key={b.id} batch={b} onUpdate={updateBatch} />
        ))}
      </div>
    </div>
  );
}

/** Eén batch. Zolang er werk is, vraagt de kaart de stand op; dat werkt de batch ook verder af. */
function BatchCard({ batch, onUpdate }: { batch: BatchView; onUpdate: (b: BatchView) => void }) {
  const active = batch.status === "QUEUED" || batch.status === "RUNNING";
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const failures = useRef(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch(`/api/batches/${batch.id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Bijwerken is niet gelukt.");
        failures.current = 0;
        setError(null);
        if (!cancelled) onUpdate({ ...data.batch, createdAt: data.batch.createdAt });
      } catch (e) {
        failures.current++;
        if (!cancelled) setError(e instanceof Error ? e.message : "Bijwerken is niet gelukt.");
      }
      if (!cancelled) timer = setTimeout(poll, Math.min(1500 * 2 ** failures.current, 30_000));
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Alleen opnieuw starten als de batch weer actief wordt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch.id, active]);

  async function retry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/batches/${batch.id}/retry`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Opnieuw proberen is niet gelukt.");
      onUpdate(data.batch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opnieuw proberen is niet gelukt.");
    } finally {
      setRetrying(false);
    }
  }

  const done = batch.items.filter((i) => i.status === "DONE").length;
  const failed = batch.items.filter((i) => i.status === "FAILED");
  const pct = batch.items.length ? Math.round(((done + failed.length) / batch.items.length) * 100) : 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{batch.title}</p>
            <p className="text-xs text-muted-foreground">
              {dateText(batch.createdAt)} · {batch.format}
            </p>
          </div>
          {active ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : batch.status === "DONE" && failed.length === 0 ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          )}
        </div>

        {batch.items.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <div className={cn("h-full bg-hhc-orange transition-all")} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {done} van {batch.items.length} klaar{failed.length > 0 ? `, ${failed.length} mislukt` : ""}
              {active ? " · laat deze pagina open" : ""}
            </p>
          </div>
        )}

        {failed.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs">
            {failed.map((i) => (
              <li key={i.id} className="text-destructive">
                <span className="font-medium">{i.label}:</span> {i.error}
                {i.designId && (
                  <>
                    {" "}
                    <a href={`/designs/${i.designId}`} className="underline">
                      Openen en aanpassen
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {(batch.error || error) && <p className="text-xs text-destructive">{batch.error ?? error}</p>}

        <div className="flex flex-wrap gap-2">
          {batch.zip && (
            <a
              href={batch.zip.url}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <Download className="h-4 w-4" /> ZIP downloaden {sizeText(batch.zip.bytes)}
            </a>
          )}
          {!active && failed.length > 0 && (
            <Button size="sm" variant="outline" onClick={retry} disabled={retrying}>
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Mislukte opnieuw proberen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
