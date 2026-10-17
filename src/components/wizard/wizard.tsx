"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Redo2, Undo2, Download, Loader2, AlertTriangle, CheckCircle2, RefreshCw, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldControl, type FieldDef } from "./field-control";
import { useDesignPersistence, type SaveState } from "./use-design-persistence";
import type { TemplateSchemaJson } from "@/lib/validations/template";
import type { ImageFieldValue } from "@/lib/render/imageFit";
import type { FontFaceInfo } from "@/lib/fonts/faces";
import type { TextIssue } from "@/components/editor/design-canvas";
import { LayerAdjustPanel } from "./layer-adjust-panel";
import { MatchRefresh } from "./match-refresh";
import { allows, applyLayerOverrides, LAYER_OVERRIDES_KEY, type LayerOverride, type LayerOverrides } from "@/lib/design/layer-overrides";

const DesignCanvas = dynamic(() => import("@/components/editor/design-canvas").then((m) => m.DesignCanvas), {
  ssr: false,
  loading: () => <div className="aspect-[4/5] w-full animate-pulse rounded-lg bg-surface-muted" />,
});

export type FormData = Record<string, unknown>;

export interface ExportInfo {
  id: string;
  revision: number;
  format: string;
  width: number;
  height: number;
  bytes: number;
  url: string;
  downloadUrl: string;
}

export interface WizardProps {
  templateName: string;
  templateVersionId: string;
  versionInfo: { versionNumber: number; newerVersionNumber: number | null };
  schema: TemplateSchemaJson;
  fields: FieldDef[];
  exportFormats: string[];
  brandColors: { hex: string; name: string }[];
  initialFormData: FormData;
  initialDesign: { id: string; revision: number; title: string | null } | null;
  initialExport: ExportInfo | null;
  fontFaces: FontFaceInfo[];
  matchId?: string | null;
}

const HISTORY_LIMIT = 100;
const COALESCE_MS = 1200;

interface HistoryEntry {
  data: FormData;
  coalesceKey?: string;
  at: number;
}

export function Wizard({
  templateName,
  templateVersionId,
  versionInfo,
  schema,
  fields,
  exportFormats,
  brandColors,
  initialFormData,
  initialDesign,
  initialExport,
  fontFaces,
  matchId,
}: WizardProps) {
  const router = useRouter();
  const [textIssues, setTextIssues] = useState<TextIssue[]>([]);
  // Alleen wat de invuller zelf kan oplossen; een ontbrekend lettertype is
  // een templateprobleem en blokkeert de export op de server.
  const blockingTextIssues = textIssues.filter((i) => i.kind === "overflow" || i.kind === "font-failed");
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [hist, setHist] = useState<{ entries: HistoryEntry[]; index: number }>({
    entries: [{ data: initialFormData, at: 0 }],
    index: 0,
  });
  const [format, setFormat] = useState(initialExport?.format ?? exportFormats[0] ?? "PNG");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [result, setResult] = useState<(ExportInfo & { forSeq: number }) | null>(
    initialExport ? { ...initialExport, forSeq: 0 } : null
  );
  const [busy, setBusy] = useState(false);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const narrow = useNarrowViewport();

  /** Klik in de preview: naar het veld en de invoer focussen. */
  const selectFromCanvas = useCallback((key: string) => {
    setSelectedField(key);
    const el = document.getElementById(`field-${key}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: narrow.active ? "center" : "nearest" });
    const input = el.querySelector<HTMLElement>("input:not([type=hidden]):not(.hidden), textarea, select, button");
    input?.focus({ preventScroll: true });
  }, [narrow.active]);

  const persistence = useDesignPersistence({
    templateVersionId,
    matchId: matchId ?? null,
    title: templateName,
    initialDesign,
  });
  const { saver, designId, revision, changeSeq } = persistence;

  /**
   * Eén wijziging in de geschiedenis. Opeenvolgende wijzigingen met dezelfde
   * `coalesceKey` binnen korte tijd (doortypen in één veld, een schuifregelaar)
   * worden samengevoegd tot één stap; de geschiedenis is begrensd.
   */
  const commit = useCallback(
    (next: FormData, coalesceKey?: string) => {
      setFormData(next);
      const now = Date.now();
      setHist(({ entries, index }) => {
        const base = entries.slice(0, index + 1);
        const top = base[base.length - 1];
        if (coalesceKey && base.length > 1 && top.coalesceKey === coalesceKey && now - top.at < COALESCE_MS) {
          base[base.length - 1] = { data: next, coalesceKey, at: now };
          return { entries: base, index: base.length - 1 };
        }
        const appended = [...base, { data: next, coalesceKey, at: now }].slice(-HISTORY_LIMIT);
        return { entries: appended, index: appended.length - 1 };
      });
      saver.change(next);
    },
    [saver]
  );

  function updateField(key: string, value: unknown, coalesceKey?: string) {
    commit({ ...formData, [key]: value }, coalesceKey);
  }

  function resetField(field: FieldDef) {
    const next = { ...formData };
    if (field.type === "CHECKBOX") next[field.key] = field.defaultValue !== "false";
    else if (field.defaultValue) next[field.key] = field.defaultValue;
    else delete next[field.key];
    commit(next);
  }

  const jump = useCallback(
    (delta: number) => {
      const target = hist.index + delta;
      if (target < 0 || target >= hist.entries.length) return;
      const data = hist.entries[target].data;
      setHist({ entries: hist.entries, index: target });
      setFormData(data);
      saver.change(data);
    },
    [hist, saver]
  );
  const undo = useCallback(() => jump(-1), [jump]);
  const redo = useCallback(() => jump(1), [jump]);

  // Sneltoetsen alleen buiten invoervelden, zodat ze niet botsen met typen
  // (daar werkt de eigen ongedaan-maken van de browser).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const missingRequired = useMemo(
    () =>
      fields.filter((f) => {
        if (!f.required) return false;
        const v = formData[f.key];
        if (f.type === "IMAGE" || f.type === "LOGO") {
          const img = v as ImageFieldValue | undefined;
          return !img?.assetUrl && !img?.asset;
        }
        if (f.type === "CHECKBOX") return false;
        return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
      }),
    [fields, formData]
  );

  const resultIsCurrent = result !== null && result.forSeq === changeSeq && result.format === format;

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    const seqAtStart = changeSeq;
    try {
      // Eerst alles opslaan: er wordt altijd een opgeslagen revisie gerenderd.
      const saved = await saver.flush();
      if (!saved) throw new Error("Je wijzigingen zijn nog niet opgeslagen (zie de melding hierboven).");
      const { designId: id, revision: rev } = saver.getSnapshot();
      const res = await fetch(`/api/designs/${id}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, revision: rev }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) throw new Error("Er is intussen iets gewijzigd. Probeer het nog een keer.");
      if (!res.ok) throw new Error(data.error ?? "Het maken van de afbeelding is niet gelukt.");
      // Gekoppeld aan de invoer van het moment van aanvragen: is er sindsdien
      // iets gewijzigd, dan toont de wizard het resultaat als verouderd en
      // valt er niets te downloaden tot er opnieuw gemaakt is.
      setResult({ ...data.export, forSeq: seqAtStart });
      router.refresh();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Het maken van de afbeelding is niet gelukt.");
    } finally {
      setExporting(false);
    }
  }

  async function switchToNewerVersion() {
    if (!designId) return;
    setBusy(true);
    try {
      const flushed = await saver.flush();
      if (!flushed) throw new Error("Sla eerst je wijzigingen op.");
      const planRes = await fetch(`/api/designs/${designId}/switch-version`);
      const plan = await planRes.json();
      if (!planRes.ok) throw new Error(plan.error ?? "Overstappen is niet mogelijk.");
      const r = plan.report as { fromVersion: number; toVersion: number; carried: string[]; dropped: string[]; added: string[] };
      const lines = [
        `Er wordt een kopie gemaakt op versie ${r.toVersion}. Je huidige ontwerp (versie ${r.fromVersion}) blijft bewaard.`,
        r.carried.length ? `Gaat mee: ${r.carried.join(", ")}.` : "Er gaan geen ingevulde waarden mee.",
        r.dropped.length ? `Vervalt (bestaat niet meer of past niet): ${r.dropped.join(", ")}.` : "",
        r.added.length ? `Nieuw in te vullen: ${r.added.join(", ")}.` : "",
      ].filter(Boolean);
      if (!window.confirm(lines.join("\n\n"))) return;
      const res = await fetch(`/api/designs/${designId}/switch-version`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Overstappen is niet gelukt.");
      router.push(`?designId=${data.design.id}`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Overstappen is niet gelukt.");
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    if (!designId) return;
    setBusy(true);
    try {
      const flushed = await saver.flush();
      if (!flushed) throw new Error("Sla eerst je wijzigingen op.");
      const res = await fetch(`/api/designs/${designId}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Dupliceren is niet gelukt.");
      router.push(`?designId=${data.design.id}`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Dupliceren is niet gelukt.");
    } finally {
      setBusy(false);
    }
  }

  function takeTheirs() {
    const data = saver.takeTheirs();
    if (!data) return;
    setFormData(data);
    setHist({ entries: [{ data, at: 0 }], index: 0 });
  }

  // Laag die de invuller zelf mag aanpassen (ingesteld in de builder).
  const adjustLayer = selectedField
    ? schema.layers.find((l) => "field" in l && l.field === selectedField && (l.allow?.length ?? 0) > 0)
    : undefined;
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const adjusting = Boolean(adjustLayer) && adjustingId === adjustLayer?.id;
  const overrides = (formData[LAYER_OVERRIDES_KEY] ?? {}) as LayerOverrides;
  const effectiveSchema = useMemo(() => applyLayerOverrides(schema, formData), [schema, formData]);

  function setOverride(layerId: string, patch: LayerOverride | null) {
    const next: LayerOverrides = { ...overrides };
    if (patch === null) delete next[layerId];
    else next[layerId] = { ...next[layerId], ...patch };
    const data = { ...formData };
    if (Object.keys(next).length) data[LAYER_OVERRIDES_KEY] = next;
    else delete data[LAYER_OVERRIDES_KEY];
    commit(data, patch === null ? undefined : `layer:${layerId}:${Object.keys(patch).join(",")}`);
  }

  const textFields = fields.filter((f) => !["IMAGE", "LOGO", "BRAND_COLOR", "CHECKBOX"].includes(f.type));
  const mediaFields = fields.filter((f) => ["IMAGE", "LOGO"].includes(f.type));
  const otherFields = fields.filter((f) => ["BRAND_COLOR", "CHECKBOX"].includes(f.type));

  const renderField = (f: FieldDef) => (
    <FieldControl
      key={f.key}
      field={f}
      value={formData[f.key]}
      onChange={(v, coalesceKey) => updateField(f.key, v, coalesceKey)}
      onReset={() => resetField(f)}
      brandColors={brandColors}
      selected={selectedField === f.key}
      onFocusField={() => setSelectedField(f.key)}
    />
  );

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="order-2 flex flex-col gap-6 lg:order-1">
        <div>
          <h1 className="text-xl font-bold">{templateName}</h1>
          <p className="text-sm text-muted-foreground">Vul de gegevens in. De preview werkt direct mee.</p>
        </div>

        {versionInfo.newerVersionNumber !== null && designId && (
          <div className="rounded-md border border-border bg-surface-muted p-3 text-sm">
            Dit ontwerp gebruikt versie {versionInfo.versionNumber} van de template. Versie{" "}
            {versionInfo.newerVersionNumber} is nu actief.
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={switchToNewerVersion} disabled={busy}>
                Overstappen naar versie {versionInfo.newerVersionNumber}
              </Button>
            </div>
          </div>
        )}

        <SaveBanner
          state={persistence.state}
          error={persistence.error}
          onRetry={() => saver.retry()}
          onKeepMine={() => saver.keepMine()}
          onTakeTheirs={takeTheirs}
        />

        {matchId && (
          <MatchRefresh
            matchId={matchId}
            templateVersionId={templateVersionId}
            fields={fields}
            formData={formData}
            onApply={(values) => commit({ ...formData, ...values })}
          />
        )}

        {adjustLayer && (
          <LayerAdjustPanel
            layer={adjustLayer}
            effective={effectiveSchema.layers.find((l) => l.id === adjustLayer.id) ?? adjustLayer}
            override={overrides[adjustLayer.id]}
            brandColors={brandColors}
            adjusting={adjusting}
            onToggleAdjust={() => setAdjustingId(adjusting ? null : adjustLayer.id)}
            onChange={(patch) => setOverride(adjustLayer.id, patch)}
            onReset={() => setOverride(adjustLayer.id, null)}
          />
        )}

        {textFields.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">1. Informatie</h2>
            {textFields.map(renderField)}
          </section>
        )}

        {mediaFields.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">2. Foto&apos;s en logo&apos;s</h2>
            {mediaFields.map(renderField)}
          </section>
        )}

        {otherFields.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Opties</h2>
            {otherFields.map(renderField)}
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">3. Controleren en downloaden</h2>
          {missingRequired.length > 0 && (
            <p className="text-xs text-destructive">Nog in te vullen: {missingRequired.map((f) => f.label).join(", ")}</p>
          )}
          {blockingTextIssues.map((issue) => (
            <p key={`${issue.layerId}-${issue.kind}`} className="text-xs text-destructive">
              {issue.message}
            </p>
          ))}
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Bestandsformaat">
            {exportFormats.map((fmt) => (
              <button
                key={fmt}
                type="button"
                role="radio"
                aria-checked={format === fmt}
                onClick={() => setFormat(fmt)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hhc-orange)] ${format === fmt ? "border-primary bg-primary/10 text-hhc-orange-dark" : "border-border text-muted-foreground"}`}
              >
                {fmt}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {schema.width} × {schema.height} pixels{format === "JPG" ? ", transparante delen krijgen de achtergrondkleur" : ""}.
          </p>
          <Button size="lg" onClick={handleExport} disabled={exporting || missingRequired.length > 0 || blockingTextIssues.some((i) => i.kind === "overflow") || persistence.state === "conflict"}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {exporting ? "Bezig met maken..." : resultIsCurrent ? "Opnieuw maken" : "Afbeelding maken"}
          </Button>
          {exportError && <p className="text-xs text-destructive">{exportError}</p>}

          {result && (
            <div className="flex flex-col gap-2">
              <div className="relative overflow-hidden rounded-md border border-border bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result.url} alt="Gemaakte afbeelding" className={`w-full ${resultIsCurrent ? "" : "opacity-50"}`} />
              </div>
              {resultIsCurrent ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Dit is het bestand dat je downloadt: {result.format},{" "}
                  {result.width} × {result.height} px, {Math.max(1, Math.round(result.bytes / 1024))} kB.
                </p>
              ) : (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> Verouderd: je hebt daarna nog iets gewijzigd of een ander formaat gekozen.
                </p>
              )}
              <a
                href={resultIsCurrent ? result.downloadUrl : undefined}
                aria-disabled={!resultIsCurrent}
                className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold ${resultIsCurrent ? "bg-primary text-primary-foreground hover:opacity-90" : "pointer-events-none bg-surface-muted text-muted-foreground"}`}
              >
                <Download className="h-4 w-4" /> Downloaden
              </a>
            </div>
          )}

          {designId && (
            <Button variant="outline" size="sm" onClick={duplicate} disabled={busy}>
              <Copy className="h-4 w-4" /> Dupliceren als nieuw ontwerp
            </Button>
          )}
          {!designId && <p className="text-center text-xs text-muted-foreground">Het concept wordt bewaard zodra je iets wijzigt.</p>}
          {designId && <p className="text-center text-xs text-muted-foreground">Revisie {revision}</p>}
        </section>
      </div>

      {/* Op een telefoon blijft de preview bovenaan staan tijdens het invullen. */}
      <div className="sticky top-[65px] z-10 order-1 -mx-4 border-b border-border bg-background/95 px-4 pb-2 pt-1 backdrop-blur lg:static lg:order-2 lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="flex flex-col gap-2 lg:sticky lg:top-20 lg:gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Live preview</p>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" onClick={undo} disabled={hist.index <= 0} title="Ongedaan maken (Ctrl+Z)" aria-label="Ongedaan maken">
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={redo} disabled={hist.index >= hist.entries.length - 1} title="Opnieuw (Ctrl+Shift+Z)" aria-label="Opnieuw">
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Card className="overflow-hidden bg-hhc-black p-2 lg:p-4">
            <CardContent className="flex items-center justify-center p-0">
              <DesignCanvas
                schema={schema}
                formData={formData}
                textTransforms={Object.fromEntries(fields.map((f) => [f.key, f.textTransform ?? "NONE"]))}
                maxWidth={620}
                maxHeight={narrow.active ? narrow.previewHeight : 760}
                fontFaces={fontFaces}
                onTextIssues={setTextIssues}
                onImageTransform={(key, value) => updateField(key, value, `img:${key}`)}
                onSelectField={selectFromCanvas}
                selectedField={selectedField}
                builder={
                  adjusting && adjustLayer
                    ? {
                        selectedLayerId: adjustLayer.id,
                        only: [adjustLayer.id],
                        rotate: false,
                        canMove: (l) => allows(l, "move"),
                        canResize: (l) => allows(l, "resize"),
                        onSelectLayer: (id) => {
                          if (!id) setAdjustingId(null);
                        },
                        onChangeLayer: (id, g) =>
                          setOverride(id, allows(adjustLayer, "resize") ? { x: g.x, y: g.y, width: g.width, height: g.height } : { x: g.x, y: g.y }),
                      }
                    : undefined
                }
              />
            </CardContent>
          </Card>
          <p className="hidden text-xs text-muted-foreground lg:block">
            Tik op een tekst of foto in de preview om die aan te passen. De preview is een snelle weergave. Het gemaakte bestand onder &ldquo;Controleren en downloaden&rdquo; is wat je
            downloadt.
          </p>
        </div>
      </div>
    </div>
  );
}

function SaveBanner({
  state,
  error,
  onRetry,
  onKeepMine,
  onTakeTheirs,
}: {
  state: SaveState;
  error: string | null;
  onRetry: () => void;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
}) {
  if (state === "conflict") {
    return (
      <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
        <p className="font-medium">Dit ontwerp is ergens anders gewijzigd (ander tabblad of andere gebruiker).</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={onKeepMine}>Mijn versie bewaren</Button>
          <Button size="sm" variant="outline" onClick={onTakeTheirs}>Andere versie laden</Button>
        </div>
      </div>
    );
  }
  if (state === "error" || state === "invalid") {
    return (
      <div role="alert" className="flex items-start justify-between gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
        <span>
          {state === "error" ? "Opslaan is niet gelukt; je invoer staat nog hier en wordt opnieuw geprobeerd." : "Niet opgeslagen."}
          {error ? ` ${error}` : ""}
        </span>
        <Button size="sm" variant="outline" onClick={onRetry}>Opnieuw</Button>
      </div>
    );
  }
  const label =
    state === "saving" ? "Opslaan..." : state === "pending" ? "Niet opgeslagen wijzigingen" : state === "saved" ? "Opgeslagen" : null;
  if (!label) return null;
  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      {state === "saving" && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
      {label}
    </p>
  );
}

/** Smal scherm (telefoon): preview beperkt tot ruim een derde van de hoogte. */
function useNarrowViewport() {
  const [state, setState] = useState({ active: false, previewHeight: 300 });
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const update = () =>
      setState({ active: query.matches, previewHeight: Math.max(200, Math.round(window.innerHeight * 0.4)) });
    update();
    query.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return state;
}
