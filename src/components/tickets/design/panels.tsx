"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { api, errorText } from "@/components/tickets/parts";
import { formatDay, formatDayTime } from "@/lib/date-format";
import { FORMAT_LABEL, type Layer } from "@/lib/tickets/design/fields";
import type { DesignIssue } from "@/lib/tickets/design/validate";
import type { OverrideMap } from "@/lib/tickets/design/resolve";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`mt-10 w-full ${wide ? "max-w-3xl" : "max-w-xl"} rounded-xl bg-surface p-5 shadow-xl outline-none`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <Button variant="ghost" size="icon" aria-label="Sluiten" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function IssueList({ issues }: { issues: DesignIssue[] }) {
  if (!issues.length) return <p className="text-sm text-success">Geen meldingen: het ontwerp is leesbaar, scanbaar en past op één A4-pagina.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {issues.map((i, n) => (
        <li key={n} className={i.level === "error" ? "text-destructive" : "text-amber-800"}>
          <span className="font-semibold">{i.level === "error" ? "Moet opgelost: " : "Let op: "}</span>
          {i.message}
          {i.format ? <span className="text-muted-foreground"> ({i.format === "mobile" ? "mobiel" : "A4"})</span> : null}
        </li>
      ))}
    </ul>
  );
}

interface Impact {
  changes: { field: string; key: string; layer: Layer; before: unknown; after: unknown }[];
  follows: { seasons: number; upcomingEvents: number; activeTypes: number };
  protectedBy: { field: string; layer: Layer; scopes: string[] }[];
  lowerScopes: number;
  issuedTickets: number;
  usedBy: string[];
}

const describe = (o: unknown) => {
  if (!o) return "overerven";
  const x = o as { m: string; v?: unknown };
  if (x.m === "hidden") return "niet tonen";
  if (x.m === "empty") return "bewust leeg";
  const v = x.v;
  if (Array.isArray(v)) return `${v.length} item(s)`;
  if (typeof v === "boolean") return v ? "aan" : "uit";
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 57).trimEnd()}…` : s;
};

/** Controleren en publiceren: meldingen, wijzigingen, gevolgen en de knop. */
export function PublishPanel({ scopeKey, label, draft, revision, canPublish, onClose, onDone, flush }: { scopeKey: string; label: string; draft: OverrideMap; revision: number; canPublish: boolean; onClose: () => void; onDone: () => void; flush: () => Promise<number> }) {
  const [issues, setIssues] = useState<DesignIssue[] | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([api<{ issues: DesignIssue[] }>("/api/tickets/design/check", { body: { scopeKey, overrides: draft } }), api<Impact>("/api/tickets/design/impact", { body: { scopeKey, overrides: draft } })])
      .then(([c, i]) => {
        setIssues(c.issues);
        setImpact(i);
      })
      .catch((e) => setError(errorText(e)));
  }, [scopeKey, draft]);
  const errors = issues?.filter((i) => i.level === "error") ?? [];
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const rev = await flush();
      await api("/api/tickets/design/publish", { body: { scopeKeys: [scopeKey], revisions: { [scopeKey]: rev ?? revision }, note } });
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Controleren en publiceren: ${label}`} onClose={onClose} wide>
      {error && <p className="mb-3 rounded bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
      {!issues || !impact ? (
        <p className="text-sm text-muted-foreground">Bezig met controleren van mobiel en A4 met korte en lange voorbeeldnamen…</p>
      ) : (
        <div className="space-y-4">
          <section>
            <h3 className="mb-1 text-sm font-bold">1. Controles</h3>
            <IssueList issues={issues} />
          </section>
          <section>
            <h3 className="mb-1 text-sm font-bold">2. Wat verandert er ({impact.changes.length})</h3>
            {impact.changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen verschillen met de gepubliceerde versie.</p>
            ) : (
              <ul className="max-h-48 space-y-0.5 overflow-y-auto text-sm">
                {impact.changes.map((c, i) => (
                  <li key={i}>
                    <span className="font-medium">{c.field}</span> <span className="text-muted-foreground">({FORMAT_LABEL[c.layer]})</span>: {describe(c.before)} → <span className="font-medium">{describe(c.after)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="mb-1 text-sm font-bold">3. Gevolgen</h3>
            <ul className="list-disc space-y-0.5 pl-5 text-sm">
              <li>
                Geldt voor nieuwe uitgiftes binnen dit niveau: {impact.follows.seasons} seizoen(en), {impact.follows.upcomingEvents} komende duel(s), {impact.follows.activeTypes} actieve tickettype(s), voor zover ze dit niveau volgen.
              </li>
              <li>
                <strong>{impact.issuedTickets}</strong> al uitgegeven ticket(s) behouden hun vastgelegde ontwerp. Alleen met &lsquo;Bestaande tickets opnieuw vormgeven&rsquo; verandert dat; QR-code en rechten blijven altijd gelijk.
              </li>
              {impact.usedBy.length > 0 && <li>Deze ontwerpset is gekozen bij: {impact.usedBy.join(", ")}.</li>}
              {impact.protectedBy.filter((p) => p.scopes.length).map((p, i) => (
                <li key={i}>
                  &lsquo;{p.field}&rsquo; wordt niet overgenomen door {p.scopes.length} lager niveau(s) met een eigen afwijking: {p.scopes.slice(0, 6).join("; ")}
                  {p.scopes.length > 6 ? " …" : ""}
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2">
            <Label htmlFor="pub-note">Notitie bij deze versie (optioneel)</Label>
            <Input id="pub-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Bijvoorbeeld: nieuwe hoofdsponsor" />
          </section>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!canPublish && <p className="mr-auto text-sm text-muted-foreground">Je kunt concepten bewerken, maar publiceren vraagt de bevoegdheid &lsquo;Ticketontwerp publiceren&rsquo;.</p>}
            <Button variant="outline" onClick={onClose}>
              Terug naar de editor
            </Button>
            <Button onClick={go} disabled={!canPublish || busy || errors.length > 0 || impact.changes.length === 0}>
              {busy ? "Publiceren…" : "Publiceer beide formaten"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function HistoryPanel({ scopeKey, canEdit, onClose, onRestored }: { scopeKey: string; canEdit: boolean; onClose: () => void; onRestored: () => void }) {
  const [data, setData] = useState<{ versions: { version: number; at: string; by: string | null; note: string | null; count: number; changes: number }[]; log: { at: string; actorName: string | null; summary: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<typeof data>(`/api/tickets/design/history?scope=${encodeURIComponent(scopeKey)}`).then(setData).catch((e) => setError(errorText(e)));
  }, [scopeKey]);
  const restore = async (version: number) => {
    try {
      await api("/api/tickets/design/restore", { body: { scopeKey, version } });
      onRestored();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <Modal title="Versies en wijzigingen" onClose={onClose} wide>
      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
      {!data ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Terugzetten maakt van een eerdere versie een concept; na publiceren geldt die voor nieuwe uitgiftes. Scans, transacties en uitgegeven tickets veranderen niet.</p>
          {data.versions.length === 0 && <p className="text-sm">Nog niet gepubliceerd.</p>}
          <ul className="divide-y rounded border">
            {data.versions.map((v, i) => (
              <li key={v.version} className="flex flex-wrap items-center gap-3 p-2 text-sm">
                <span className="font-semibold">Versie {v.version}</span>
                {i === 0 && <span className="rounded bg-success/10 px-2 py-0.5 text-xs text-success">Gepubliceerd</span>}
                <span className="text-muted-foreground">
                  {formatDayTime(v.at)} · {v.by ?? "onbekend"} · {v.count} afwijking(en), {v.changes} wijziging(en)
                </span>
                {v.note && <span className="w-full text-xs">“{v.note}”</span>}
                {canEdit && i > 0 && (
                  <Button size="sm" variant="outline" className="ml-auto" onClick={() => restore(v.version)}>
                    Zet terug als concept
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {data.log.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-bold">Logboek</h3>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {data.log.map((l, i) => (
                  <li key={i}>
                    {formatDayTime(l.at)} · {l.actorName ?? "systeem"} · {l.summary}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

export function ReapplyPanel({ scopeKey, label, onClose }: { scopeKey: string; label: string; onClose: () => void }) {
  const [preview, setPreview] = useState<{ total: number; changed: number; unchanged: number } | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ total: number; changed: number; unchanged: number }>("/api/tickets/design/reapply", { body: { scopeKey, dryRun: true } }).then(setPreview).catch((e) => setError(errorText(e)));
  }, [scopeKey]);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api<{ changed: number }>("/api/tickets/design/reapply", { body: { scopeKey, dryRun: false } });
      setDone(r.changed);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Bestaande tickets opnieuw vormgeven: ${label}`} onClose={onClose}>
      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
      {done !== null ? (
        <p className="text-sm">{done} ticket(s) tonen nu het gepubliceerde ontwerp. Wie het ticket opent, ziet de nieuwe opmaak; een eerder gedownloade pdf verandert niet. Opnieuw versturen gaat via Ticketoverzicht.</p>
      ) : !preview ? (
        <p className="text-sm text-muted-foreground">Bezig met berekenen…</p>
      ) : (
        <div className="space-y-3 text-sm">
          <p>
            Binnen dit niveau zijn <strong>{preview.total}</strong> actieve ticket(s). Daarvan krijgen <strong>{preview.changed}</strong> het nu gepubliceerde ontwerp; {preview.unchanged} hebben dat al.
          </p>
          <ul className="list-disc pl-5 text-muted-foreground">
            <li>Ticketnummer, QR-code, link, toegangsrechten en scanregistraties blijven precies gelijk.</li>
            <li>Alleen de opmaak verandert (mobiele pagina en een nieuw gedownloade pdf).</li>
            <li>Er wordt niets automatisch verstuurd.</li>
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Annuleren
            </Button>
            <Button onClick={go} disabled={busy || preview.changed === 0}>
              {busy ? "Bezig…" : `Vormgeef ${preview.changed} ticket(s) opnieuw`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function CopyPanel({ kind, to, options, onClose, onDone }: { kind: "season" | "event"; to: string; options: { key: string; label: string }[]; onClose: () => void; onDone: (review: string[]) => void }) {
  const [from, setFrom] = useState(options[0]?.key ?? "");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    try {
      const r = await api<{ copied: number; review: string[] }>("/api/tickets/design/copy", { body: { from, to, overwrite: confirm } });
      onDone(r.review);
    } catch (e) {
      const msg = errorText(e);
      if (msg.includes("Bevestig")) setConfirm(true);
      setError(msg);
    }
  };
  return (
    <Modal title={kind === "season" ? "Nieuw seizoen voorbereiden op basis van een ander seizoen" : "Ontwerpinstellingen overnemen van een ander duel"} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Alleen ontwerpinstellingen (ook die per tickettype) worden overgenomen, als concept. {kind === "season" ? "Tickets, persoonsgegevens, scans en wedstrijddatums gaan niet mee. Het nieuwe seizoen wordt een zelfstandige kopie, geen verwijzing." : "Wedstrijdgegevens, tickets en toegangsregels van dit duel blijven zoals ze zijn."}
        </p>
        <Label htmlFor="copy-from">Overnemen van</Label>
        <Select id="copy-from" value={from} onChange={(e) => setFrom(e.target.value)}>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </Select>
        {error && <p className="text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Annuleren
          </Button>
          <Button onClick={go} disabled={!from}>
            {confirm ? "Vervang als concept" : "Overnemen als concept"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function SeasonOverview({ seasonId, onOpen }: { seasonId: string; onOpen: (eventId: string) => void }) {
  const [data, setData] = useState<{ events: { id: string; title: string; startsAt: string; status: string; follows: boolean; deviations: number; groups: string[]; hasDraft: boolean }[] } | null>(null);
  useEffect(() => {
    api<typeof data>(`/api/tickets/design/overview?season=${seasonId}`).then(setData).catch(() => setData({ events: [] }));
  }, [seasonId]);
  if (!data) return <p className="text-sm text-muted-foreground">Laden…</p>;
  if (!data.events.length) return <p className="text-sm text-muted-foreground">Nog geen duels in dit seizoen. Nieuwe duels volgen automatisch de gepubliceerde seizoensstandaard.</p>;
  return (
    <ul className="divide-y rounded border text-sm">
      {data.events.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center gap-2 p-2">
          <button type="button" className="min-w-0 flex-1 text-left font-medium hover:underline" onClick={() => onOpen(e.id)}>
            {e.title} <span className="font-normal text-muted-foreground">· {formatDay(e.startsAt)}</span>
          </button>
          {e.follows ? <span className="rounded bg-success/10 px-2 py-0.5 text-xs text-success">Volgt seizoensstandaard</span> : <span className="rounded bg-primary/10 px-2 py-0.5 text-xs">Wijkt af: {e.groups.join(", ")}</span>}
          {e.hasDraft && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Concept</span>}
        </li>
      ))}
    </ul>
  );
}

export function UploadPanel({ kind, assets, onClose, onDone }: { kind: string; assets: { id: string; name: string; kind: string }[]; onClose: () => void; onDone: (id: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [k, setK] = useState(kind);
  const [replace, setReplace] = useState("");
  const [usage, setUsage] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!replace) return;
    api<{ usedIn: string[] }>(`/api/tickets/design/assets/${replace}`).then((r) => setUsage(r.usedIn)).catch(() => setUsage([]));
  }, [replace]);
  const go = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("name", name || file.name.replace(/\.[a-z0-9]+$/i, ""));
      fd.set("kind", k);
      if (replace) fd.set("assetId", replace);
      const res = await fetch("/api/tickets/design/assets", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Uploaden mislukt.");
      onDone(data.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Afbeelding uploaden" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div>
          <Label htmlFor="up-kind">Soort</Label>
          <Select id="up-kind" value={k} onChange={(e) => setK(e.target.value)}>
            <option value="SPONSOR">Sponsorlogo</option>
            <option value="LOGO">Logo (club of tegenstander)</option>
            <option value="PHOTO">Sfeerbeeld (foto)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="up-replace">Nieuw of vervangen</Label>
          <Select id="up-replace" value={replace} onChange={(e) => setReplace(e.target.value)}>
            <option value="">Nieuwe afbeelding</option>
            {assets.filter((a) => a.kind === k).map((a) => (
              <option key={a.id} value={a.id}>
                Nieuwe versie van: {a.name}
              </option>
            ))}
          </Select>
          {replace && (
            <p className="mt-1 text-xs text-muted-foreground">
              De nieuwe versie geldt voor nieuwe uitgiftes en voorbeelden. Al uitgegeven tickets houden de versie die bij uitgifte is vastgelegd.
              {usage && usage.length > 0 && ` In gebruik bij: ${usage.join("; ")}.`}
            </p>
          )}
        </div>
        {!replace && (
          <div>
            <Label htmlFor="up-name">Naam</Label>
            <Input id="up-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bijvoorbeeld: naam van de sponsor" maxLength={80} />
          </div>
        )}
        <div>
          <Label htmlFor="up-file">Bestand (PNG, JPG, WebP of SVG, max. 12 MB)</Label>
          <Input id="up-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <p className="mt-1 text-xs text-muted-foreground">Logo&apos;s houden hun verhoudingen en transparantie. Voor A4 minstens 1000 px breed (foto) of 240 px (logo).</p>
        </div>
        {error && <p className="text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Annuleren
          </Button>
          <Button onClick={go} disabled={!file || busy}>
            {busy ? "Uploaden…" : "Uploaden"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
