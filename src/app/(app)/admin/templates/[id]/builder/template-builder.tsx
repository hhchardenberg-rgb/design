"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, Loader2, Redo2, Square, Type, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { FieldEditorRow } from "./field-editor-row";
import type { Layer, TemplateSchemaJson, TextLayer } from "@/lib/validations/template";
import type { FontFaceInfo } from "@/lib/fonts/faces";
import { TextFontPanel } from "./text-font-panel";
import { ImportReportPanel } from "./import-report-panel";
import { LayerList, LayerProperties } from "./layer-panel";
import { useBuilderHistory } from "./use-builder-history";
import type { LayerGeometry } from "@/components/editor/builder-overlay";
import type { ImportReport } from "@/lib/psd/parse";

const DesignCanvas = dynamic(() => import("@/components/editor/design-canvas").then((m) => m.DesignCanvas), {
  ssr: false,
  loading: () => <div className="aspect-[4/5] w-full animate-pulse rounded-lg bg-surface-muted" />,
});

export interface BuilderField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  defaultValue: string | null;
  placeholder: string | null;
  maxLength: number | null;
  textTransform: string;
  options: { label: string; value: string }[] | null;
  imageFit: "contain" | "cover" | null;
  sortOrder: number;
}

export interface BuilderVersion {
  id: string;
  versionNumber: number;
  status: string;
  /** Ooit actief geweest: onveranderlijk, bewerken gaat via een nieuwe conceptversie. */
  locked: boolean;
  designCount: number;
  width: number;
  height: number;
  schemaJson: TemplateSchemaJson;
  importReport: ImportReport | null;
  exportFormats: string[];
  fields: BuilderField[];
}

export interface BuilderTemplate {
  id: string;
  name: string;
  category: string;
  description: string | null;
  status: string;
  activeVersionId: string | null;
  versions: BuilderVersion[];
}

const EXPORT_FORMATS = ["PNG", "JPG", "WEBP"];

export function TemplateBuilder({
  template,
  initialVersionId,
  fontFaces,
}: {
  template: BuilderTemplate;
  initialVersionId?: string;
  fontFaces: FontFaceInfo[];
}) {
  const router = useRouter();
  const sortedVersions = [...template.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const [versionId, setVersionId] = useState(initialVersionId ?? sortedVersions[0]?.id);
  const version = sortedVersions.find((v) => v.id === versionId) ?? sortedVersions[0];

  // Of een versie "live" is, wordt afgeleid van Template.status +
  // activeVersionId — niet van TemplateVersion.status zelf. Dat laatste kan
  // uit de pas lopen (bv. na archiveren/herstellen van de template), en gaf
  // dan een misleidend badge dat niet overeenkwam met het overzicht.
  const isLive = (v: { id: string }) => template.status === "PUBLISHED" && template.activeVersionId === v.id;

  const { schema, fields, setSchema, setFields, reset, undo, redo, canUndo, canRedo } = useBuilderHistory({
    schema: version.schemaJson,
    fields: version.fields,
  });
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const selectedLayer = schema.layers.find((l) => l.id === selectedLayerId) ?? null;
  const [exportFormats, setExportFormats] = useState<string[]>(version.exportFormats);
  const [name, setName] = useState(template.name);
  const [category, setCategory] = useState(template.category);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const previewFormData = useMemo(() => {
    const data: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === "CHECKBOX") data[f.key] = f.defaultValue !== "false";
      else if (f.type === "BRAND_COLOR") data[f.key] = f.defaultValue ?? undefined;
      else if (f.defaultValue) data[f.key] = f.defaultValue;
      else if (f.placeholder) data[f.key] = f.placeholder;
    }
    return data;
  }, [fields]);

  function switchVersion(id: string) {
    const v = sortedVersions.find((x) => x.id === id);
    if (!v) return;
    setVersionId(id);
    reset({ schema: v.schemaJson, fields: v.fields });
    setSelectedLayerId(null);
    setExportFormats(v.exportFormats);
  }

  function updateField(index: number, next: BuilderField) {
    setFields((prev) => prev.map((f, i) => (i === index ? next : f)));
  }

  const backgroundLayer = schema.layers.find((l): l is Extract<Layer, { type: "background" }> => l.type === "background");
  const backgroundReplaceable = Boolean(backgroundLayer?.field);

  function toggleBackgroundReplaceable(enabled: boolean) {
    if (!backgroundLayer) return;
    if (enabled) {
      let key = "background_photo";
      let i = 2;
      while (fields.some((f) => f.key === key)) key = `background_photo_${i++}`;
      setFields((prev) => [
        ...prev,
        {
          key,
          label: "Achtergrondfoto",
          type: "IMAGE",
          required: false,
          defaultValue: null,
          placeholder: null,
          maxLength: null,
          textTransform: "NONE",
          options: null,
          imageFit: "cover",
          sortOrder: prev.length,
        },
      ]);
      setSchema((prev) => ({
        ...prev,
        layers: prev.layers.map((l) => (l.type === "background" ? { ...l, field: key, fit: "cover" } : l)),
      }));
    } else {
      const key = backgroundLayer.field;
      setFields((prev) => prev.filter((f) => f.key !== key));
      setSchema((prev) => ({
        ...prev,
        layers: prev.layers.map((l) => {
          if (l.type !== "background") return l;
          const rest = { ...l };
          delete rest.field;
          return rest;
        }),
      }));
    }
  }

  /** Leesbaar label voor een laag in de "Lagen"-lijst hieronder. */
  function layerLabel(layer: Layer): string {
    if (layer.name) return layer.name;
    if ("field" in layer) {
      const f = fields.find((x) => x.key === layer.field);
      if (f) return f.label;
    }
    const TYPE_LABELS: Record<Layer["type"], string> = {
      background: "Achtergrond",
      static_image: "Vaste afbeelding",
      text: "Tekst",
      image: "Afbeelding",
      color: "Kleurvlak",
    };
    return `${TYPE_LABELS[layer.type]} (${layer.id})`;
  }

  /**
   * Maakt één specifieke laag individueel aan/uit-zetbaar voor de gebruiker
   * — een generalisatie van de VISIBILITY:-naamgevingsconventie uit de PSD
   * (die alleen door de designer vooraf gegroepeerde lagen dekt) naar élke
   * laag, rechtstreeks vanuit de builder.
   */
  function toggleLayerVisibility(layerId: string, enabled: boolean) {
    const layer = schema.layers.find((l) => l.id === layerId);
    if (!layer) return;

    if (enabled) {
      let key = `toon_${layerId}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      let i = 2;
      while (fields.some((f) => f.key === key)) key = `toon_${layerId}_${i++}`;
      setFields((prev) => [
        ...prev,
        {
          key,
          label: `Toon: ${layerLabel(layer)}`,
          type: "CHECKBOX",
          required: false,
          defaultValue: "true",
          placeholder: null,
          maxLength: null,
          textTransform: "NONE",
          options: null,
          imageFit: null,
          sortOrder: fields.length,
        },
      ]);
      setSchema((prev) => ({
        ...prev,
        layers: prev.layers.map((l) => (l.id === layerId ? { ...l, visibilityField: key } : l)),
      }));
    } else {
      const key = layer.visibilityField;
      const stillUsed = key ? schema.layers.some((l) => l.id !== layerId && l.visibilityField === key) : false;
      setSchema((prev) => ({
        ...prev,
        layers: prev.layers.map((l) => {
          if (l.id !== layerId) return l;
          const rest = { ...l };
          delete rest.visibilityField;
          return rest;
        }),
      }));
      if (key && !stillUsed) {
        setFields((prev) => prev.filter((f) => f.key !== key));
      }
    }
  }

  const locked = version.locked;

  const updateLayer = useCallback(
    (layerId: string, patch: Partial<Layer>) => {
      setSchema((prev) => ({
        ...prev,
        layers: prev.layers.map((l) => {
          if (l.id !== layerId) return l;
          const next = { ...l, ...patch } as Layer & { psdBaseline?: unknown };
          for (const [k, v] of Object.entries(patch)) if (v === undefined) delete (next as Record<string, unknown>)[k];
          return next as Layer;
        }),
      }));
    },
    [setSchema]
  );

  function changeGeometry(layerId: string, g: LayerGeometry) {
    const layer = schema.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const patch: Record<string, unknown> = { ...g };
    // Een ander kaderformaat: de tekst volgt weer de uitlijning in het kader.
    if (layer.type === "text" && layer.psdBaseline && Math.abs(g.height - layer.height) > 0.5) patch.psdBaseline = undefined;
    updateLayer(layerId, patch as Partial<Layer>);
  }

  function moveLayer(layerId: string, direction: "up" | "down") {
    setSchema((prev) => {
      const layers = [...prev.layers];
      const i = layers.findIndex((l) => l.id === layerId);
      const j = direction === "up" ? i + 1 : i - 1;
      if (i < 0 || j < 0 || j >= layers.length || layers[j].type === "background") return prev;
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...prev, layers };
    });
  }

  function deleteLayer(layerId: string) {
    const layer = schema.layers.find((l) => l.id === layerId);
    if (!layer || layer.type === "background") return;
    if (!window.confirm(`Laag "${layerLabel(layer)}" verwijderen?`)) return;
    const field = "field" in layer ? layer.field : undefined;
    const remaining = schema.layers.filter((l) => l.id !== layerId);
    const stillUsed = (key?: string) =>
      Boolean(key) && remaining.some((l) => ("field" in l && l.field === key) || l.visibilityField === key);
    setSchema((prev) => ({ ...prev, layers: prev.layers.filter((l) => l.id !== layerId) }));
    const drop = [field, layer.visibilityField].filter((k): k is string => Boolean(k) && !stillUsed(k));
    if (drop.length) setFields((prev) => prev.filter((f) => !drop.includes(f.key)));
    setSelectedLayerId(null);
  }

  /** Nieuwe invulbare laag met bijbehorend veld, midden op het canvas. */
  function addLayer(kind: "text" | "image" | "color") {
    const base = { text: "tekst", image: "foto", color: "kleur" }[kind];
    let n = 1;
    const taken = (key: string) => fields.some((f) => f.key === key) || schema.layers.some((l) => l.id === key);
    while (taken(`${base}_${n}`)) n++;
    const key = `${base}_${n}`;
    const label = { text: "Tekst", image: "Foto", color: "Kleur" }[kind] + ` ${n}`;
    const w = Math.round(schema.width * (kind === "text" ? 0.6 : 0.3));
    const h = Math.round(kind === "text" ? Math.max(40, schema.height * 0.08) : w);
    const box = { id: key, name: label, x: Math.round((schema.width - w) / 2), y: Math.round((schema.height - h) / 2), width: w, height: h, rotation: 0, opacity: 1 };
    const layer: Layer =
      kind === "text"
        ? {
            ...box,
            type: "text",
            field: key,
            text: "Voorbeeldtekst",
            fontFamily: "Inter",
            fontWeight: 700,
            fontStyle: "normal",
            fontSize: Math.round(h * 0.7),
            minFontSize: Math.max(12, Math.round(h * 0.3)),
            color: "#FFFFFF",
            align: "center",
            verticalAlign: "middle",
            uppercase: false,
            letterSpacing: 0,
            lineHeight: 1.15,
            maxLines: 1,
            allowTruncate: false,
          }
        : kind === "image"
          ? { ...box, type: "image", field: key, fit: "cover", shape: "rect", cornerRadius: 0 }
          : { ...box, type: "color", field: key, shape: "rect", cornerRadius: 0, defaultColor: "#FF6F00" };
    setSchema((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setFields((prev) => [
      ...prev,
      {
        key,
        label,
        type: kind === "text" ? "SHORT_TEXT" : kind === "image" ? "IMAGE" : "BRAND_COLOR",
        required: false,
        defaultValue: kind === "color" ? "#FF6F00" : null,
        placeholder: null,
        maxLength: kind === "text" ? 60 : null,
        textTransform: "NONE",
        options: null,
        imageFit: kind === "image" ? "cover" : null,
        sortOrder: prev.length,
      },
    ]);
    setSelectedLayerId(key);
  }

  // Sneltoetsen: ongedaan maken/opnieuw, pijltjes verschuiven, Delete verwijdert.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest("input, textarea, select, [contenteditable=true]") || target.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (locked || !selectedLayer) return;
      const step = e.shiftKey ? 10 : 1;
      const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (delta[e.key]) {
        e.preventDefault();
        const [dx, dy] = delta[e.key];
        updateLayer(selectedLayer.id, { x: selectedLayer.x + dx, y: selectedLayer.y + dy });
      } else if (e.key === "Escape") {
        setSelectedLayerId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, selectedLayer, undo, redo, updateLayer]);

  async function saveTemplateInfo() {
    await fetch("/api/admin/templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: template.id, name, category }),
    });
  }

  async function saveVersion(publish = false) {
    setSaving(true);
    setMessage(null);
    try {
      await saveTemplateInfo();
      if (version.locked) {
        setMessage("Naam en categorie opgeslagen. Deze versie zelf kan niet meer worden gewijzigd.");
        router.refresh();
        return;
      }
      const res = await fetch(`/api/admin/templates/${template.id}/versions/${version.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: fields.map((f) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            defaultValue: f.defaultValue || undefined,
            placeholder: f.placeholder || undefined,
            maxLength: f.maxLength || undefined,
            textTransform: f.textTransform,
            options: f.options?.length ? f.options : undefined,
            imageFit: f.imageFit || undefined,
            sortOrder: f.sortOrder,
          })),
          schemaJson: schema,
          exportFormats,
          publish,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Opslaan is niet gelukt.");
      const warnings = (data.warnings ?? []).map((w: { message: string }) => w.message).join(" ");
      setMessage((publish ? "Opgeslagen en geactiveerd." : "Wijzigingen opgeslagen.") + (warnings ? ` Let op: ${warnings}` : ""));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Opslaan is niet gelukt.");
    } finally {
      setSaving(false);
    }
  }

  async function activateVersion(id: string) {
    setMessage(null);
    const res = await fetch(`/api/admin/templates/${template.id}/versions/${id}/activate`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(data.error ?? "Activeren is niet gelukt.");
    router.refresh();
  }

  async function createDraft() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/templates/${template.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromVersionId: version.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Nieuwe versie maken is niet gelukt.");
      router.push(`/admin/templates/${template.id}/builder?versionId=${data.version.id}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nieuwe versie maken is niet gelukt.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/admin/templates" className="text-xs text-muted-foreground hover:underline">
            &larr; Alle templates
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-64 text-lg font-bold" />
            <Badge variant={isLive(version) ? "success" : "outline"}>
              v{version.versionNumber} · {isLive(version) ? "actief" : version.locked ? "eerder actief" : "concept"}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-40">
            {["Wedstrijd", "Opstelling", "Uitslag", "Speler", "Sociaal", "Nieuws", "Evenementen", "Jeugd", "Vrouwenvoetbal", "Overig"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Link href={`/admin/templates/new?templateId=${template.id}`}>
            <Button variant="outline">Nieuwe versie uploaden</Button>
          </Link>
          {version.locked ? (
            <Button onClick={createDraft} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Nieuwe conceptversie maken
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => saveVersion(false)} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Opslaan
              </Button>
              <Button onClick={() => saveVersion(true)} disabled={saving}>
                Opslaan en activeren
              </Button>
            </>
          )}
        </div>
      </div>

      {version.locked && (
        <p className="rounded-md border border-border bg-surface-muted p-3 text-sm">
          Versie {version.versionNumber} is al in gebruik geweest
          {version.designCount > 0 ? ` (${version.designCount} ontwerp${version.designCount === 1 ? "" : "en"})` : ""} en kan
          daarom niet meer worden gewijzigd. Bestaande ontwerpen blijven zo werken. Wil je iets aanpassen? Maak een nieuwe
          conceptversie, test die en activeer hem daarna.
        </p>
      )}
      {message && <p className="text-sm text-hhc-orange-dark">{message}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {!locked && (
              <>
                <Button size="sm" variant="outline" onClick={() => addLayer("text")}>
                  <Type className="h-4 w-4" /> Tekstveld
                </Button>
                <Button size="sm" variant="outline" onClick={() => addLayer("image")}>
                  <ImageIcon className="h-4 w-4" /> Fotokader
                </Button>
                <Button size="sm" variant="outline" onClick={() => addLayer("color")}>
                  <Square className="h-4 w-4" /> Kleurvlak
                </Button>
              </>
            )}
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" onClick={undo} disabled={!canUndo} title="Ongedaan maken (Ctrl+Z)">
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={redo} disabled={!canRedo} title="Opnieuw (Ctrl+Shift+Z)">
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Card className="bg-hhc-black p-4">
            <CardContent className="flex justify-center p-0">
              <DesignCanvas
                schema={schema}
                formData={previewFormData}
                maxWidth={720}
                maxHeight={720}
                editable={false}
                fontFaces={fontFaces}
                textTransforms={Object.fromEntries(fields.map((f) => [f.key, f.textTransform]))}
                builder={
                  locked
                    ? undefined
                    : { selectedLayerId, onSelectLayer: setSelectedLayerId, onChangeLayer: changeGeometry }
                }
                selectedField={locked && selectedLayer && "field" in selectedLayer ? selectedLayer.field : undefined}
              />
            </CardContent>
          </Card>
          {!locked && (
            <p className="text-xs text-muted-foreground">
              Klik een laag om hem te kiezen; sleep om te verplaatsen en gebruik de grepen om te schalen of te draaien.
              Randen en middens klikken vast aan het canvas en aan andere lagen. Pijltjestoetsen schuiven 1 px (met Shift
              10 px).
            </p>
          )}

          {version.importReport && (
            <ImportReportPanel report={version.importReport} templateId={template.id} versionId={version.id} schema={schema} />
          )}

          {backgroundLayer && (
            <label className="flex items-start gap-2 rounded-md border border-border bg-surface-muted p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={backgroundReplaceable}
                onChange={(e) => toggleBackgroundReplaceable(e.target.checked)}
              />
              <span>
                <span className="font-medium">Achtergrond door gebruiker laten vervangen</span>
                <br />
                <span className="text-xs text-muted-foreground">
                  Voegt een foto-veld toe waarmee de gebruiker de achtergrond van dit ontwerp door een eigen foto kan
                  vervangen (met crop/pan/zoom), in plaats van de vaste PSD-achtergrond.
                </span>
              </span>
            </label>
          )}

          <TextFontPanel
            layers={schema.layers.filter((l): l is TextLayer => l.type === "text")}
            faces={fontFaces}
            locked={version.locked}
            onChange={(layerId, patch) =>
              setSchema((prev) => ({
                ...prev,
                layers: prev.layers.map((l) => (l.id === layerId && l.type === "text" ? { ...l, ...patch } : l)),
              }))
            }
          />

          <div>
            <Label>Exportformaten</Label>
            <div className="flex gap-3">
              {EXPORT_FORMATS.map((fmt) => (
                <label key={fmt} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={exportFormats.includes(fmt)}
                    onChange={(e) =>
                      setExportFormats((prev) => (e.target.checked ? [...prev, fmt] : prev.filter((f) => f !== fmt)))
                    }
                  />
                  {fmt}
                </label>
              ))}
            </div>
          </div>

          {sortedVersions.length > 1 && (
            <div>
              <Label>Versiegeschiedenis</Label>
              <div className="flex flex-col gap-2">
                {sortedVersions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <button className="text-left hover:underline" onClick={() => switchVersion(v.id)}>
                      v{v.versionNumber} {v.id === version.id && "(huidig getoond)"}
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge variant={isLive(v) ? "success" : "outline"}>
                        {isLive(v) ? "Actief" : v.locked ? "Eerder actief" : "Concept"}
                      </Badge>
                      {!isLive(v) && (
                        <Button size="sm" variant="outline" onClick={() => activateVersion(v.id)}>
                          Activeren
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <Label>Lagen</Label>
            <p className="mb-2 text-xs text-muted-foreground">
              Bovenste laag bovenaan. Met het oogje kan de gebruiker een laag zelf tonen of verbergen (bv. een sponsorlogo).
            </p>
            <LayerList
              layers={schema.layers}
              selectedId={selectedLayerId}
              label={layerLabel}
              locked={locked}
              onSelect={setSelectedLayerId}
              onMove={moveLayer}
              onDelete={deleteLayer}
              onToggleVisibility={toggleLayerVisibility}
            />
          </div>
          {selectedLayer && (
            <Card>
              <CardContent className="p-4">
                <LayerProperties
                  key={selectedLayer.id}
                  layer={selectedLayer}
                  locked={locked}
                  fieldLabel={"field" in selectedLayer ? fields.find((f) => f.key === selectedLayer.field)?.label : undefined}
                  onChange={(patch) => updateLayer(selectedLayer.id, patch)}
                />
              </CardContent>
            </Card>
          )}
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Velden ({fields.length})
          </h2>
          {fields.map((f, i) => (
            <FieldEditorRow key={f.key} field={f} onChange={(next) => updateField(i, next)} />
          ))}
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Geen velden herkend. Controleer de laagnamen in het PSD-bestand — zie de documentatie voor designers.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
