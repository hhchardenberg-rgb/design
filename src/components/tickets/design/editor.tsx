"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, History, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Label, Select } from "@/components/ui/input";
import { api, errorText, PageTitle } from "@/components/tickets/parts";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { seasonOptionLabel } from "@/lib/commercial/season-phase";
import { formatDay } from "@/lib/date-format";
import { FIELDS, FORMAT_LABEL, GROUPS, KIND_LABEL, type FieldDef, type GroupKey, type Layer, type TicketKind } from "@/lib/tickets/design/fields";
import { chainFor, diffOverrides, originText, listOverrides, overrideCount, resetGroup, resolveAll, scopeKeyOf, setOverride, type LayerInput, type Override, type OverrideMap, type ScopeRef, type SetLayer } from "@/lib/tickets/design/resolve";
import { buildView, SAMPLE_PRESETS, type AssetMap, type SamplePreset, type ViewBlock } from "@/lib/tickets/design/view";
import { sampleFacts, type SampleEvent } from "@/lib/tickets/design/sample";
import { unsupportedOverrides, viewIssues, type DesignIssue } from "@/lib/tickets/design/validate";
import type { A4Layout } from "@/lib/tickets/design/a4-layout";
import { MobileTicket } from "./mobile-ticket";
import { A4Preview } from "./a4-preview";
import { FieldEditor, type AssetOption, type SetOption } from "./field-editor";
import { CopyPanel, HistoryPanel, IssueList, Modal, PublishPanel, ReapplyPanel, SeasonOverview, UploadPanel } from "./panels";

interface ScopeRow {
  key: string;
  level: string;
  typeId: string | null;
  label: string;
  published: OverrideMap;
  publishedVersion: number;
  publishedAt: string | null;
  publishedBy: string | null;
  draft: OverrideMap | null;
  draftRevision: number;
  draftUpdatedAt: string | null;
  draftUpdatedBy: string | null;
}
interface EditorData {
  scope: { key: string; ref: ScopeRef; label: string };
  can: { edit: boolean; publish: boolean; apply: boolean };
  scopes: ScopeRow[];
  labels: Record<string, string>;
  sets: (SetOption & { description: string | null; builtin: boolean; sourceNote: string | null; published: OverrideMap | null; hasDraft: boolean; kind: TicketKind })[];
  fallbackSets: Record<TicketKind, string | null>;
  assets: AssetOption[];
  types: { id: string; name: string; category: string; color: string | null; active: boolean; kind: TicketKind }[];
  seasons: { id: string; name: string; startsOn: string; endsOn: string }[];
  events: { id: string; title: string; startsAt: string; seasonId: string | null; status: string }[];
  event: (SampleEvent & { id: string; seasonId: string | null }) | null;
  season: { id: string; name: string } | null;
}

type SaveState = { kind: "idle" | "saving" | "saved" | "error" | "conflict"; at?: string; message?: string };
type Preview = "mobile" | "a4" | "both";

const LEVEL_NAMES: Record<string, string> = { club: "Club", season: "Seizoen", event: "Duel", set: "Ontwerpset" };

export function DesignEditor({ initialScope }: { initialScope: string }) {
  const router = useRouter();
  const toast = useStableToast();
  const [scopeKey, setScopeKey] = useState(initialScope);
  const [data, setData] = useState<EditorData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<OverrideMap>({});
  const [revision, setRevision] = useState(0);
  const [past, setPast] = useState<OverrideMap[]>([]);
  const [future, setFuture] = useState<OverrideMap[]>([]);
  const [dirty, setDirty] = useState(false);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [group, setGroup] = useState<GroupKey | "afwijkingen" | "teksten">("teksten");
  const [advanced, setAdvanced] = useState(false);
  const [preview, setPreview] = useState<Preview>("mobile");
  const [preset, setPreset] = useState<SamplePreset>("kort");
  const [previewType, setPreviewType] = useState<string>("");
  const [previewKind, setPreviewKind] = useState<TicketKind>("match");
  const [device, setDevice] = useState(390);
  const [bigText, setBigText] = useState(false);
  const [gray, setGray] = useState(false);
  const [a4, setA4] = useState<{ layout: A4Layout; issues: DesignIssue[] } | null>(null);
  const [a4Busy, setA4Busy] = useState(false);
  const [panel, setPanel] = useState<null | "publish" | "history" | "reapply" | "copy" | "upload" | "diff" | "newset" | "overview" | "resetgroup">(null);
  const [uploadKind, setUploadKind] = useState("SPONSOR");
  const revRef = useRef(0);

  const load = useCallback(
    async (key: string) => {
      try {
        const d = await api<EditorData>(`/api/tickets/design/context?scope=${encodeURIComponent(key)}`);
        setData(d);
        const row = d.scopes.find((s) => s.key === d.scope.key);
        setDraft(row?.draft ?? row?.published ?? {});
        setRevision(row?.draftRevision ?? 0);
        revRef.current = row?.draftRevision ?? 0;
        setPast([]);
        setFuture([]);
        setDirty(false);
        setSave(row?.draft ? { kind: "saved", at: row.draftUpdatedAt ?? undefined, message: row.draftUpdatedBy ? `door ${row.draftUpdatedBy}` : undefined } : { kind: "idle" });
        setLoadError(null);
        const ref = d.scope.ref;
        if (ref.typeId) {
          setPreviewType(ref.typeId);
          setPreviewKind(d.types.find((t) => t.id === ref.typeId)?.kind ?? "match");
        } else if (ref.setId) {
          setPreviewType("");
          setPreviewKind(d.sets.find((s) => s.id === ref.setId)?.kind ?? "match");
        } else {
          setPreviewType("");
          if (ref.eventId) setPreviewKind((k) => (k === "season" ? "match" : k));
        }
      } catch (e) {
        setLoadError(errorText(e));
      }
    },
    [],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- laden bij wisselen van niveau
    load(scopeKey);
  }, [scopeKey, load]);

  const goScope = (key: string) => {
    setScopeKey(key);
    router.replace(`/tickets/ontwerp?scope=${encodeURIComponent(key)}`, { scroll: false });
  };

  // ── Concept automatisch bewaren ───────────────────────────────────────────
  const flush = useCallback(async (): Promise<number> => {
    if (!data || !data.can.edit) return revRef.current;
    setSave({ kind: "saving" });
    try {
      const r = await api<{ revision: number; savedAt: string; hasDraft: boolean }>("/api/tickets/design/draft", { method: "PUT", body: { scopeKey: data.scope.key, overrides: draft, revision: revRef.current } });
      revRef.current = r.revision;
      setRevision(r.revision);
      setDirty(false);
      setSave({ kind: "saved", at: r.savedAt, message: r.hasDraft ? undefined : "gelijk aan gepubliceerd" });
      return r.revision;
    } catch (e) {
      const msg = errorText(e);
      setSave({ kind: msg.includes("intussen gewijzigd") ? "conflict" : "error", message: msg });
      throw e;
    }
  }, [data, draft]);

  useEffect(() => {
    if (!dirty || save.kind === "conflict") return;
    const t = setTimeout(() => flush().catch(() => {}), 900);
    return () => clearTimeout(t);
  }, [dirty, draft, flush, save.kind]);

  const change = (next: OverrideMap) => {
    setPast((p) => [...p.slice(-49), draft]);
    setFuture([]);
    setDraft(next);
    setDirty(true);
  };
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [draft, ...f]);
    setDraft(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setDirty(true);
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, draft]);
    setDraft(future[0]);
    setFuture((f) => f.slice(1));
    setDirty(true);
  };

  // ── Effectieve instellingen (zelfde functie als de pdf en de ticketpagina) ────
  const ref = data?.scope.ref;
  const seasonId = ref?.seasonId ?? data?.event?.seasonId ?? null;
  const typeRow = data?.types.find((t) => t.id === previewType) ?? null;
  const kind: TicketKind = typeRow?.kind ?? previewKind;

  const computed = useMemo(() => {
    if (!data || !ref) return null;
    const scopeMap = new Map(data.scopes.map((s) => [s.key, s]));
    const sets: Record<string, SetLayer> = {};
    for (const s of data.sets) if (s.published && !s.archived) sets[s.id] = { id: s.id, name: s.name, overrides: s.published };
    const build = (own: OverrideMap) => {
      const localSets = { ...sets };
      let chain: LayerInput[] = [];
      let fallback = data.fallbackSets[kind];
      if (ref.setId) {
        const s = data.sets.find((x) => x.id === ref.setId);
        localSets[ref.setId] = { id: ref.setId, name: s?.name ?? "", overrides: own };
        fallback = ref.setId;
      } else {
        const refs = chainFor({ typeId: previewType || null, seasonId, eventId: kind === "season" ? null : ref.eventId ?? null });
        chain = refs.map((r) => {
          const key = scopeKeyOf(r);
          const row = scopeMap.get(key);
          return { level: r.level, scopeKey: key, label: data.labels[key] ?? row?.label ?? key, overrides: key === data.scope.key ? own : row?.published ?? {} };
        });
      }
      return resolveAll({ kind, chain, sets: localSets, fallbackSetId: fallback });
    };
    const res = build(draft);
    const parent = build({});
    const assets: AssetMap = Object.fromEntries(data.assets.map((a) => [a.id, { assetId: a.id, versionId: null, url: a.url, width: a.width, height: a.height, name: a.name }]));
    const facts = sampleFacts({ kind, preset, event: data.event, typeName: typeRow?.name, typeColor: typeRow?.color, seasonName: data.season?.name ?? data.seasons.find((s) => s.id === seasonId)?.name ?? null });
    const mobileView = buildView(facts, res.mobile, "mobile", assets);
    const a4View = buildView(facts, res.a4, "a4", assets);
    const issues = [...unsupportedOverrides(draft, { mobile: res.mobile, a4: res.a4 }), ...viewIssues(mobileView), ...viewIssues(a4View)];
    return { res, parent, mobileView, issues };
  }, [data, ref, draft, kind, previewType, preset, seasonId, typeRow]);

  // A4: de indeling komt van de server (exacte lettertypematen), met vertraging tijdens het typen.
  useEffect(() => {
    if (!data || preview === "mobile") return;
    const t = setTimeout(() => {
      setA4Busy(true);
      api<{ layout: A4Layout; issues: DesignIssue[] }>("/api/tickets/design/preview", { body: { scopeKey: data.scope.key, overrides: draft, kind, typeId: previewType || null, preset, event: data.event, seasonId, eventId: data.event?.id ?? null, seasonName: data.season?.name ?? null, typeName: typeRow?.name ?? null, typeColor: typeRow?.color ?? null } })
        .then(setA4)
        .catch((e) => setA4({ layout: a4?.layout ?? (null as unknown as A4Layout), issues: [{ level: "error", message: errorText(e) }] }))
        .finally(() => setA4Busy(false));
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a4 zelf hoort niet in de afhankelijkheden
  }, [data, draft, kind, previewType, preset, preview, seasonId, typeRow]);

  const downloadPdf = async () => {
    if (!data) return;
    const res = await fetch("/api/tickets/design/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scopeKey: data.scope.key, overrides: draft, kind, typeId: previewType || null, preset, event: data.event, seasonId, eventId: data.event?.id ?? null, seasonName: data.season?.name ?? null, typeName: typeRow?.name ?? null, typeColor: typeRow?.color ?? null, output: "pdf" }) });
    if (!res.ok) return toast.error("De voorbeeld-pdf kon niet worden gemaakt.");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "hhc-voorbeeldticket.pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loadError) return <p className="rounded bg-destructive/10 p-4 text-sm text-destructive">{loadError}</p>;
  if (!data || !ref || !computed) return <p className="text-sm text-muted-foreground">Ticketontwerp laden…</p>;

  const readOnly = !data.can.edit;
  const row = data.scopes.find((s) => s.key === data.scope.key);
  const pending = diffOverrides(row?.published, draft).length;
  const fieldsIn = (g: GroupKey) => FIELDS.filter((f) => f.group === g && (!f.kinds || f.kinds.includes(kind)) && (advanced || !f.advanced || hasOverride(draft, f.key)) && !(f.type === "designSet" && ref.level === "set"));
  const visibleGroups = GROUPS.filter((g) => fieldsIn(g.key).length > 0 || (g.key === "ontwerpset" && ref.level !== "set"));
  const level = ref.level === "set" ? "set" : ref.eventId ? "event" : ref.seasonId ? "season" : "club";
  const baseRef = (lvl: string, extra: Partial<ScopeRef> = {}): ScopeRef => {
    const typeId = extra.typeId !== undefined ? extra.typeId : ref.typeId;
    if (lvl === "set") return { level: "set", setId: extra.setId ?? data.sets[0]?.id };
    if (lvl === "club") return typeId ? { level: "clubType", typeId } : { level: "club" };
    if (lvl === "season") {
      const sid = extra.seasonId ?? seasonId ?? data.seasons[0]?.id;
      return typeId ? { level: "seasonType", seasonId: sid, typeId } : { level: "season", seasonId: sid };
    }
    const eid = extra.eventId ?? ref.eventId ?? data.events[0]?.id;
    return typeId ? { level: "eventType", eventId: eid, typeId } : { level: "event", eventId: eid };
  };
  const switchTo = (r: ScopeRef) => {
    if (dirty) flush().catch(() => {});
    if (r.level === "season" && !r.seasonId) return toast.error("Maak eerst een seizoen aan bij Tickettypes, vakken en seizoenen.");
    if (r.level === "event" && !r.eventId) return toast.error("Er zijn nog geen wedstrijden.");
    goScope(scopeKeyOf(r));
  };
  const parentLabel = ref.level === "event" || ref.level === "eventType" ? "seizoensstandaard" : ref.level === "season" || ref.level === "seasonType" ? "clubstandaard" : "standaard";
  const eventScopes = data.scopes.filter((s) => (s.level === "event" || s.level === "eventType") && ref.eventId && s.key.startsWith(`event:${ref.eventId}`));

  return (
    <div className="space-y-4">
      <PageTitle title="Ticketontwerp en standaarden" description="Ontwerp het mobiele ticket en het A4-ticket. Instellingen erven van club naar seizoen naar duel; per tickettype en formaat kun je gericht afwijken.">
        <Button variant="outline" size="sm" onClick={undo} disabled={readOnly || !past.length} aria-label="Ongedaan maken">
          <Undo2 className="h-4 w-4" /> Ongedaan maken
        </Button>
        <Button variant="outline" size="sm" onClick={redo} disabled={readOnly || !future.length} aria-label="Opnieuw uitvoeren">
          <Redo2 className="h-4 w-4" /> Opnieuw
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPanel("history")}>
          <History className="h-4 w-4" /> Versies
        </Button>
        <Button size="sm" onClick={() => (dirty ? flush().then(() => setPanel("publish")).catch(() => {}) : setPanel("publish"))} disabled={pending === 0}>
          Controleren en publiceren{pending ? ` (${pending})` : ""}
        </Button>
      </PageTitle>

      {/* Niveau kiezen */}
      <div className="grid gap-3 rounded-xl border bg-surface p-3 md:grid-cols-[auto_1fr_auto]">
        <div className="flex flex-wrap gap-1 self-start" role="radiogroup" aria-label="Niveau">
          {(["club", "season", "event", "set"] as const).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={level === l} onClick={() => switchTo(baseRef(l, l === "set" ? { typeId: undefined } : {}))} className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${level === l ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
              {LEVEL_NAMES[l]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {level === "season" && (
            <Select aria-label="Seizoen" value={ref.seasonId ?? ""} onChange={(e) => switchTo(baseRef("season", { seasonId: e.target.value }))} className="h-9 max-w-xs">
              {data.seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {seasonOptionLabel({ name: s.name, startsOn: String(s.startsOn), endsOn: String(s.endsOn) })}
                </option>
              ))}
            </Select>
          )}
          {level === "event" && (
            <Select aria-label="Duel" value={ref.eventId ?? ""} onChange={(e) => switchTo(baseRef("event", { eventId: e.target.value }))} className="h-9 max-w-md">
              {data.events.map((e) => (
                <option key={e.id} value={e.id}>
                  {formatDay(e.startsAt)} · {e.title}
                </option>
              ))}
            </Select>
          )}
          {level === "set" && (
            <>
              <Select aria-label="Ontwerpset" value={ref.setId ?? ""} onChange={(e) => switchTo({ level: "set", setId: e.target.value })} className="h-9 max-w-xs">
                {data.sets.filter((s) => !s.archived).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({KIND_LABEL[s.kind]}){s.publishedVersion === 0 ? " – nog niet gepubliceerd" : ""}
                  </option>
                ))}
              </Select>
              {data.can.edit && (
                <Button size="sm" variant="outline" onClick={() => setPanel("newset")}>
                  Nieuwe ontwerpset
                </Button>
              )}
            </>
          )}
          {level !== "set" && (
            <Select aria-label="Tickettype" value={ref.typeId ?? ""} onChange={(e) => switchTo(baseRef(level, { typeId: e.target.value || undefined }))} className="h-9 max-w-xs">
              <option value="">Alle tickettypes (algemeen)</option>
              {data.types.map((t) => (
                <option key={t.id} value={t.id}>
                  Alleen {t.name}
                  {t.active ? "" : " (inactief)"}
                </option>
              ))}
            </Select>
          )}
        </div>
        <SaveBadge save={save} dirty={dirty} readOnly={readOnly} pending={pending} />
        <p className="text-sm md:col-span-3">
          <span className="font-semibold">Je bewerkt: {data.scope.label}.</span>{" "}
          <span className="text-muted-foreground">
            {overrideCount(draft)} eigen afwijking(en); al het andere volgt {ref.level === "set" ? "de standaardwaarden" : `de ${parentLabel}`}.
            {row?.publishedVersion ? ` Gepubliceerd: versie ${row.publishedVersion}${row.publishedBy ? ` door ${row.publishedBy}` : ""}.` : " Nog niet gepubliceerd."}
          </span>
        </p>
        {save.kind === "conflict" && (
          <div className="flex flex-wrap items-center gap-2 rounded bg-amber-100 p-2 text-sm text-amber-900 md:col-span-3" role="alert">
            {save.message}
            <Button size="sm" variant="outline" onClick={() => load(scopeKey)}>
              Nieuwste versie laden
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2 md:col-span-3">
          {(ref.level === "event" || ref.level === "eventType") && data.can.edit && (
            <>
              <Button size="sm" variant="outline" onClick={() => { if (overrideCount(draft) && confirm(`Alle ${overrideCount(draft)} afwijking(en) van dit duel verwijderen? Het duel volgt daarna de seizoensstandaard.`)) change({}); }}>
                Gebruik seizoenstandaard
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPanel("copy")}>
                Neem ontwerpinstellingen over van ander duel
              </Button>
              <Button size="sm" variant="outline" onClick={async () => {
                const name = prompt("Naam van het sjabloon", `Sjabloon ${data.event?.title ?? ""}`.trim());
                if (!name) return;
                try {
                  const r = await api<{ scopeKey: string; replaced: string[] }>("/api/tickets/design/sets/from-event", { body: { eventId: ref.eventId, name, typeId: ref.typeId ?? null } });
                  toast.success(r.replaced.length ? `Sjabloon gemaakt. Wedstrijdspecifieke tekst is vervangen door dynamische velden in: ${r.replaced.join(", ")}. Publiceer het sjabloon om het te kunnen kiezen.` : "Sjabloon gemaakt als concept-ontwerpset. Publiceer het om het te kunnen kiezen.");
                  goScope(r.scopeKey);
                } catch (e) {
                  toast.error(errorText(e));
                }
              }}>
                Bewaar als herbruikbaar sjabloon
              </Button>
            </>
          )}
          {(ref.level === "event" || ref.level === "eventType") && (
            <Button size="sm" variant="outline" onClick={() => setPanel("diff")}>
              Bekijk verschillen met seizoenstandaard
            </Button>
          )}
          {ref.level === "season" && (
            <>
              <Button size="sm" variant="outline" onClick={() => setPanel("overview")}>
                Welke duels volgen of wijken af
              </Button>
              {data.can.edit && (
                <Button size="sm" variant="outline" onClick={() => setPanel("copy")}>
                  Start op basis van ander seizoen
                </Button>
              )}
            </>
          )}
          {data.can.apply && ref.level !== "set" && (
            <Button size="sm" variant="outline" onClick={() => setPanel("reapply")}>
              Bestaande tickets opnieuw vormgeven
            </Button>
          )}
          {data.can.edit && row?.draft && (
            <Button size="sm" variant="ghost" onClick={async () => {
              if (!confirm("Het concept verwerpen en teruggaan naar de gepubliceerde versie?")) return;
              await api(`/api/tickets/design/draft?scope=${encodeURIComponent(data.scope.key)}`, { method: "DELETE" });
              load(scopeKey);
            }}>
              <RotateCcw className="h-4 w-4" /> Terug naar gepubliceerde versie
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => { setUploadKind("SPONSOR"); setPanel("upload"); }} disabled={readOnly}>
            Afbeelding uploaden
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Onderdelen */}
        <nav aria-label="Onderdelen" className="flex flex-wrap items-center gap-1.5 lg:col-span-2">
          <button type="button" onClick={() => setGroup("teksten")} aria-current={group === "teksten"} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${group === "teksten" ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-surface-muted"}`}>
            Alle teksten
          </button>
          <button type="button" onClick={() => setGroup("afwijkingen")} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${group === "afwijkingen" ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-surface-muted"}`}>
            Samenvatting afwijkingen <span className="text-xs">{overrideCount(draft)}</span>
          </button>
          {visibleGroups.map((g) => {
            const n = listOverrides(draft).filter((o) => FIELDS.find((f) => f.key === o.key)?.group === g.key).length;
            return (
              <button key={g.key} type="button" onClick={() => setGroup(g.key)} aria-current={group === g.key} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${group === g.key ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-surface-muted"}`}>
                {g.label}
                {n > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{n}</span>}
              </button>
            );
          })}
          <label className="ml-2 flex items-center gap-2 text-sm">
            <Checkbox checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} /> Uitgebreide weergave
          </label>
        </nav>

        {/* Voorbeeld */}
        <section aria-label="Voorbeeld" className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="flex rounded-md border" role="radiogroup" aria-label="Formaat">
              {(["mobile", "a4", "both"] as Preview[]).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={preview === p} onClick={() => setPreview(p)} className={`px-3 py-1.5 ${preview === p ? "bg-foreground text-background" : ""}`}>
                  {p === "mobile" ? "Mobiel" : p === "a4" ? "A4" : "Naast elkaar"}
                </button>
              ))}
            </div>
            <Select aria-label="Voorbeeldgegevens" value={preset} onChange={(e) => setPreset(e.target.value as SamplePreset)} className="h-8 w-auto text-xs">
              {(Object.keys(SAMPLE_PRESETS) as SamplePreset[]).map((p) => (
                <option key={p} value={p}>
                  {SAMPLE_PRESETS[p].label}
                </option>
              ))}
            </Select>
            {!ref.typeId && ref.level !== "set" && (
              <Select aria-label="Voorbeeld als tickettype" value={previewType} onChange={(e) => setPreviewType(e.target.value)} className="h-8 w-auto text-xs">
                <option value="">Voorbeeld zonder tickettype</option>
                {data.types.map((t) => (
                  <option key={t.id} value={t.id}>
                    Voorbeeld als {t.name}
                  </option>
                ))}
              </Select>
            )}
            {!previewType && ref.level !== "set" && (
              <Select aria-label="Soort ticket" value={previewKind} onChange={(e) => setPreviewKind(e.target.value as TicketKind)} className="h-8 w-auto text-xs">
                {(Object.keys(KIND_LABEL) as TicketKind[]).filter((k) => !(k === "season" && ref.eventId)).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            )}
            {preview !== "a4" && (
              <>
                <Select aria-label="Schermbreedte" value={String(device)} onChange={(e) => setDevice(Number(e.target.value))} className="h-8 w-auto text-xs">
                  <option value="320">Smal (320 px)</option>
                  <option value="360">Android (360 px)</option>
                  <option value="390">iPhone (390 px)</option>
                  <option value="430">Groot (430 px)</option>
                </Select>
                <label className="flex items-center gap-1 text-xs">
                  <Checkbox checked={bigText} onChange={(e) => setBigText(e.target.checked)} /> Grote tekst
                </label>
              </>
            )}
            {preview !== "mobile" && (
              <>
                <label className="flex items-center gap-1 text-xs">
                  <Checkbox checked={gray} onChange={(e) => setGray(e.target.checked)} /> Grijstinten
                </label>
                <Button size="sm" variant="outline" onClick={downloadPdf}>
                  <Download className="h-3.5 w-3.5" /> Voorbeeld-pdf
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Voorbeeldticket met fictieve gegevens en een testcode die geen toegang geeft{data.event ? ` · wedstrijdgegevens van ${data.event.title}` : ""}. Klik op een blok in het voorbeeld om de tekst of het onderdeel te bewerken.
          </p>
          <div className={`grid min-w-0 gap-4 [&>*]:min-w-0 ${preview === "both" ? "lg:grid-cols-2" : ""}`}>
            {preview !== "a4" && (
              <PhoneFrame device={device} bigText={bigText}>
                <MobileTicket view={computed.mobileView} onSelectBlock={(id) => { const g = groupForBlock(id); const el = group === "teksten" ? document.getElementById(`tekst-${g}`) : null; if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true }); } else setGroup(g); }} selectedBlock={GROUPS.find((g) => g.key === group)?.block ?? null} />
              </PhoneFrame>
            )}
            {preview !== "mobile" && (
              <div className="rounded-xl border bg-surface-muted p-3">
                {a4?.layout ? <A4Preview layout={a4.layout} grayscale={gray} /> : <p className="p-8 text-center text-sm text-muted-foreground">A4-voorbeeld laden…</p>}
                {a4Busy && <p className="mt-1 text-xs text-muted-foreground">Bijwerken…</p>}
              </div>
            )}
          </div>
          <div className="rounded-xl border bg-surface p-3">
            <h2 className="mb-1 text-sm font-bold">Meldingen</h2>
            <IssueList issues={dedupe([...computed.issues, ...(preview !== "mobile" ? a4?.issues ?? [] : [])])} />
          </div>
        </section>

        {/* Instellingen */}
        <aside aria-label="Instellingen" className="min-w-0 space-y-3">
          {group === "teksten" ? (
            <TextsPanel
              kind={kind}
              advanced={advanced}
              draft={draft}
              res={computed.res}
              scopeKey={data.scope.key}
              readOnly={readOnly}
              onSet={(key, o) => change(setOverride(draft, "shared", key, o))}
              onOpenGroup={(g) => setGroup(g)}
            />
          ) : group === "afwijkingen" ? (
            <Summary draft={draft} published={row?.published ?? {}} onReset={(layer, key) => change(setOverride(draft, layer, key, undefined))} readOnly={readOnly} />
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold">{GROUPS.find((g) => g.key === group)?.label}</h2>
                  <p className="text-xs text-muted-foreground">{GROUPS.find((g) => g.key === group)?.help}</p>
                </div>
                {!readOnly && listOverrides(draft).some((o) => FIELDS.find((f) => f.key === o.key)?.group === group) && (
                  <Button size="sm" variant="ghost" onClick={() => setPanel("resetgroup")}>
                    <RotateCcw className="h-3.5 w-3.5" /> Herstel onderdeel
                  </Button>
                )}
              </div>
              {group === "ontwerpset" && ref.level !== "set" && <p className="text-xs text-muted-foreground">Elke soort ticket heeft een eigen ontwerpset. Zonder keuze gebruikt de Hub het basisontwerp. Alleen gepubliceerde sets zijn te kiezen.</p>}
              {fieldsIn(group as GroupKey).map((f) => (
                <FieldEditor
                  key={`${data.scope.key}-${f.key}`}
                  field={f}
                  resolved={{ mobile: computed.res.mobile[f.key], a4: computed.res.a4[f.key] }}
                  parent={{ mobile: computed.parent.mobile[f.key], a4: computed.parent.a4[f.key] }}
                  overrides={draft}
                  scopeKey={data.scope.key}
                  readOnly={readOnly}
                  advanced={advanced}
                  assets={data.assets}
                  sets={data.sets}
                  onChange={(layer, o) => change(setOverride(draft, layer, f.key, o))}
                  onUpload={(k) => {
                    setUploadKind(k);
                    setPanel("upload");
                  }}
                />
              ))}
              {!advanced && FIELDS.some((f) => f.group === group && f.advanced) && (
                <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setAdvanced(true)}>
                  Meer instellingen tonen
                </button>
              )}
            </>
          )}
        </aside>
      </div>

      {panel === "publish" && <PublishPanel scopeKey={data.scope.key} label={data.scope.label} draft={draft} revision={revision} canPublish={data.can.publish} flush={flush} onClose={() => setPanel(null)} onDone={() => { setPanel(null); toast.success("Gepubliceerd. Nieuwe uitgiftes gebruiken dit ontwerp; bestaande tickets houden hun vastgelegde ontwerp."); load(scopeKey); }} />}
      {panel === "history" && <HistoryPanel scopeKey={data.scope.key} canEdit={data.can.edit} onClose={() => setPanel(null)} onRestored={() => { setPanel(null); toast.success("Teruggezet als concept. Controleer en publiceer om het te laten gelden."); load(scopeKey); }} />}
      {panel === "reapply" && <ReapplyPanel scopeKey={data.scope.key} label={data.scope.label} onClose={() => setPanel(null)} />}
      {panel === "upload" && <UploadPanel kind={uploadKind} assets={data.assets} onClose={() => setPanel(null)} onDone={() => { setPanel(null); toast.success("Afbeelding opgeslagen."); load(scopeKey); }} />}
      {panel === "overview" && ref.seasonId && (
        <Modal title="Duels in dit seizoen" onClose={() => setPanel(null)} wide>
          <SeasonOverview seasonId={ref.seasonId} onOpen={(id) => { setPanel(null); switchTo({ level: "event", eventId: id }); }} />
        </Modal>
      )}
      {panel === "copy" && (
        <CopyPanel
          kind={ref.eventId ? "event" : "season"}
          to={ref.eventId ? `event:${ref.eventId}` : `season:${ref.seasonId}`}
          options={ref.eventId ? data.events.filter((e) => e.id !== ref.eventId).map((e) => ({ key: `event:${e.id}`, label: `${formatDay(e.startsAt)} · ${e.title}` })) : data.seasons.filter((s) => s.id !== ref.seasonId).map((s) => ({ key: `season:${s.id}`, label: seasonOptionLabel({ name: s.name, startsOn: String(s.startsOn), endsOn: String(s.endsOn) }) }))}
          onClose={() => setPanel(null)}
          onDone={(review) => {
            setPanel(null);
            toast.success(review.length ? `Overgenomen als concept. Controleer deze seizoens- of wedstrijdgebonden onderdelen: ${review.join(", ")}.` : "Overgenomen als concept.");
            load(scopeKey);
          }}
        />
      )}
      {panel === "diff" && (
        <Modal title="Verschillen met de seizoenstandaard" onClose={() => setPanel(null)} wide>
          <p className="mb-2 text-sm text-muted-foreground">Alleen deze instellingen wijken af; al het andere volgt de seizoenstandaard.</p>
          {eventScopes.every((s) => !overrideCount(s.key === data.scope.key ? draft : s.draft ?? s.published)) ? (
            <p className="text-sm">Dit duel volgt de seizoenstandaard volledig.</p>
          ) : (
            eventScopes.map((s) => {
              const map = s.key === data.scope.key ? draft : s.draft ?? s.published;
              if (!overrideCount(map)) return null;
              return (
                <section key={s.key} className="mb-3">
                  <h3 className="text-sm font-bold">{s.typeId ? `Alleen ${data.types.find((t) => t.id === s.typeId)?.name ?? "tickettype"}` : "Alle tickettypes"}</h3>
                  <Summary draft={map} published={s.published} onReset={() => {}} readOnly />
                </section>
              );
            })
          )}
        </Modal>
      )}
      {panel === "resetgroup" && (
        <Modal title="Onderdeel herstellen" onClose={() => setPanel(null)}>
          {(() => {
            const r = resetGroup(draft, group);
            return (
              <div className="space-y-3 text-sm">
                <p>Deze afwijkingen op dit niveau verdwijnen; daarna geldt weer de bovenliggende instelling:</p>
                <ul className="list-disc pl-5">
                  {r.removed.map((x) => (
                    <li key={`${x.layer}-${x.key}`}>
                      {FIELDS.find((f) => f.key === x.key)?.label} <span className="text-muted-foreground">({FORMAT_LABEL[x.layer]})</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setPanel(null)}>
                    Annuleren
                  </Button>
                  <Button onClick={() => { change(r.map); setPanel(null); }}>Herstel {r.removed.length} instelling(en)</Button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
      {panel === "newset" && <NewSetPanel sets={data.sets} onClose={() => setPanel(null)} onDone={(key) => { setPanel(null); goScope(key); }} />}
    </div>
  );
}

const hasOverride = (m: OverrideMap, key: string) => !!(m.shared?.[key] || m.mobile?.[key] || m.a4?.[key]);
const dedupe = (list: DesignIssue[]) => list.filter((x, i) => list.findIndex((y) => y.message === x.message && y.format === x.format) === i);

function groupForBlock(id: ViewBlock["id"]): GroupKey {
  const map: Partial<Record<ViewBlock["id"], GroupKey>> = { header: "logos", hero: "sfeerbeeld", match: "wedstrijdkop", type: "tickettype", qr: "scan", holder: "houder", access: "toegang", message: "boodschap", info: "praktisch", sponsors: "sponsoren", extra: "extra", footer: "voettekst" };
  return map[id] ?? "layout";
}

/**
 * Toont het mobiele ticket altijd op de gekozen schermbreedte. Is er minder ruimte (bijvoorbeeld
 * naast het A4-voorbeeld), dan wordt het geheel verkleind in plaats van samengedrukt, zodat de
 * regelafbreking gelijk blijft aan die op een echte telefoon.
 */
function PhoneFrame({ device, bigText, children }: { device: number; bigText: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState(device + 32);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSpace(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const frame = device + 8;
  const scale = Math.min(1, space / frame);
  return (
    <div ref={ref} className="rounded-xl border bg-surface-muted p-3">
      <div style={{ width: frame, margin: "0 auto", zoom: scale }} className="overflow-hidden rounded-[1.5rem] border-4 border-neutral-800 bg-white">
        <div style={{ width: device, fontSize: bigText ? "125%" : undefined }}>{children}</div>
      </div>
      {scale < 1 && <p className="mt-2 text-center text-xs text-muted-foreground">Verkleind weergegeven ({Math.round(scale * 100)}%); de indeling is gelijk aan een scherm van {device} px.</p>}
    </div>
  );
}

const TEXT_TYPES = new Set(["text", "longtext"]);

/**
 * Alle teksten van het ticket op één plek, direct te bewerken. Een wijziging geldt voor beide formaten
 * op het niveau dat je nu bewerkt; leegmaken betekent "bewust leeg". Afwijkingen per formaat en andere
 * opties staan bij het onderdeel zelf ("Meer opties").
 */
function TextsPanel({ kind, advanced, draft, res, scopeKey, readOnly, onSet, onOpenGroup }: {
  kind: TicketKind;
  advanced: boolean;
  draft: OverrideMap;
  res: { mobile: Record<string, { state: string; value: unknown; origin: Parameters<typeof originText>[0] }>; a4: Record<string, { state: string; value: unknown }> };
  scopeKey: string;
  readOnly: boolean;
  onSet: (key: string, o: Override | undefined) => void;
  onOpenGroup: (g: GroupKey) => void;
}) {
  const fields = FIELDS.filter((f) => TEXT_TYPES.has(f.type) && (!f.kinds || f.kinds.includes(kind)) && (advanced || f.group !== "ontbrekend" || hasOverride(draft, f.key)));
  const groups = GROUPS.filter((g) => fields.some((f) => f.group === g.key));
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold">Alle teksten</h2>
        <p className="text-xs text-muted-foreground">Pas hier elke tekst van het ticket aan. Het voorbeeld verandert direct mee. Gegevens van het ticket voeg je in met bijvoorbeeld {"{{naam}}"} of {"{{uitclub}}"}. Een leeg veld blijft bewust leeg.</p>
      </div>
      {groups.map((g) => (
        <section key={g.key} id={`tekst-${g.key}`} className="scroll-mt-4 space-y-2 rounded-lg border bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold">{g.label}</h3>
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onOpenGroup(g.key)}>
              Meer opties
            </button>
          </div>
          {fields.filter((f) => f.group === g.key).map((f) => (
            <QuickText key={`${scopeKey}-${f.key}`} f={f} draft={draft} r={res.mobile[f.key]} a4={res.a4[f.key]} scopeKey={scopeKey} readOnly={readOnly} onSet={onSet} onOpenGroup={() => onOpenGroup(g.key)} />
          ))}
        </section>
      ))}
    </div>
  );
}

function QuickText({ f, draft, r, a4, scopeKey, readOnly, onSet, onOpenGroup }: {
  f: FieldDef;
  draft: OverrideMap;
  r?: { state: string; value: unknown; origin: Parameters<typeof originText>[0] };
  a4?: { state: string; value: unknown };
  scopeKey: string;
  readOnly: boolean;
  onSet: (key: string, o: Override | undefined) => void;
  onOpenGroup: () => void;
}) {
  const shown = r?.state === "value" ? String(r.value ?? "") : "";
  const [text, setText] = useState(shown);
  const [focus, setFocus] = useState(false);
  // Waarde van buitenaf gewijzigd (ongedaan maken, herstel): het veld volgt mee zolang je er niet in typt.
  const [last, setLast] = useState(shown);
  if (!focus && shown !== last) {
    setLast(shown);
    setText(shown);
  }
  const own = draft.shared?.[f.key];
  const perFormat = !!(draft.mobile?.[f.key] || draft.a4?.[f.key]);
  const hidden = r?.state === "hidden";
  const differs = a4 && (a4.state !== r?.state || String(a4.value ?? "") !== shown);
  const commit = () => {
    setFocus(false);
    if (text === shown) return;
    if (text.trim() === "") {
      if (f.allowEmpty) onSet(f.key, { m: "empty" });
      else setText(shown);
      return;
    }
    onSet(f.key, { m: "value", v: f.maxLength ? text.slice(0, f.maxLength) : text });
  };
  const id = `qt-${f.key}`;
  const Input = f.type === "longtext" ? "textarea" : "input";
  return (
    <div className={`rounded-md p-2 ${own ? "bg-primary/5" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold">
          {f.label}
        </label>
        {own && !readOnly && (
          <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => onSet(f.key, undefined)}>
            <RotateCcw className="h-3 w-3" /> Herstel
          </button>
        )}
      </div>
      {hidden ? (
        <p className="text-xs text-muted-foreground">
          Niet getoond.{" "}
          <button type="button" className="underline" onClick={onOpenGroup}>
            Aanpassen
          </button>
        </p>
      ) : (
        <Input
          id={id}
          value={text}
          disabled={readOnly}
          maxLength={f.maxLength}
          rows={f.type === "longtext" ? 3 : undefined}
          onFocus={() => setFocus(true)}
          onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Enter" && f.type !== "longtext") (e.target as HTMLElement).blur();
          }}
          placeholder={r?.state === "empty" ? "Bewust leeg" : "Leeg"}
          className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
        />
      )}
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {r ? originText(r.origin, scopeKey) : ""}
        {perFormat || differs ? " · wijkt per formaat af, zie Meer opties" : ""}
      </p>
    </div>
  );
}

function SaveBadge({ save, dirty, readOnly, pending }: { save: SaveState; dirty: boolean; readOnly: boolean; pending: number }) {
  if (readOnly) return <p className="self-center text-xs text-muted-foreground">Alleen bekijken</p>;
  const time = save.at ? new Date(save.at).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }) : "";
  const text = save.kind === "saving" ? "Concept opslaan…" : dirty ? "Wijzigingen nog niet opgeslagen" : save.kind === "error" ? `Opslaan mislukt: ${save.message}` : save.kind === "conflict" ? "Niet opgeslagen: conflict" : pending ? `Concept opgeslagen${time ? ` om ${time}` : ""}${save.message ? ` ${save.message}` : ""}` : "Geen openstaand concept";
  return (
    <p role="status" aria-live="polite" className={`self-center text-xs ${save.kind === "error" || save.kind === "conflict" ? "text-destructive" : "text-muted-foreground"}`}>
      {text}
    </p>
  );
}

function Summary({ draft, published, onReset, readOnly }: { draft: OverrideMap; published: OverrideMap; onReset: (layer: Layer, key: string) => void; readOnly: boolean }) {
  const list = listOverrides(draft);
  const changed = new Set(diffOverrides(published, draft).map((d) => `${d.layer}|${d.key}`));
  if (!list.length) return <p className="text-sm text-muted-foreground">Geen eigen afwijkingen op dit niveau: alles wordt overgeërfd.</p>;
  const show = (o: Override, f?: FieldDef) => (o.m === "hidden" ? "Niet tonen" : o.m === "empty" ? "Bewust leeg" : Array.isArray(o.v) ? `${o.v.length} item(s)` : typeof o.v === "boolean" ? (o.v ? "Aan" : "Uit") : f?.options?.find((x) => x.value === o.v)?.label ?? String(o.v));
  return (
    <ul className="space-y-1 text-sm">
      {list.map(({ layer, key, o }) => {
        const f = FIELDS.find((x) => x.key === key);
        return (
          <li key={`${layer}-${key}`} className="flex items-start gap-2 rounded border p-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {f?.label ?? key} <span className="text-xs font-normal text-muted-foreground">({FORMAT_LABEL[layer]})</span>
                {changed.has(`${layer}|${key}`) && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] text-amber-900">concept</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{show(o, f)}</p>
            </div>
            {!readOnly && (
              <Button size="sm" variant="ghost" onClick={() => onReset(layer, key)}>
                Herstel
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NewSetPanel({ sets, onClose, onDone }: { sets: { id: string; name: string; publishedVersion: number }[]; onClose: () => void; onDone: (key: string) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TicketKind>("match");
  const [from, setFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Nieuwe ontwerpset" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div>
          <Label htmlFor="ns-name">Naam</Label>
          <input id="ns-name" className="h-10 w-full rounded-md border px-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bijvoorbeeld: Bekerwedstrijd" maxLength={80} />
        </div>
        <div>
          <Label htmlFor="ns-kind">Bedoeld voor</Label>
          <Select id="ns-kind" value={kind} onChange={(e) => setKind(e.target.value as TicketKind)}>
            {(Object.keys(KIND_LABEL) as TicketKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="ns-from">Beginnen vanaf</Label>
          <Select id="ns-from" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Standaardwaarden</option>
            {sets.filter((s) => s.publishedVersion > 0).map((s) => (
              <option key={s.id} value={s.id}>
                Kopie van {s.name}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Annuleren
          </Button>
          <Button
            onClick={async () => {
              try {
                const r = await api<{ scopeKey: string }>("/api/tickets/design/sets", { body: { name, kind, fromSetId: from || null } });
                onDone(r.scopeKey);
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            Aanmaken als concept
          </Button>
        </div>
      </div>
    </Modal>
  );
}
