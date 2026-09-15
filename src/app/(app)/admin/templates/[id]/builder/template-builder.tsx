"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { FieldEditorRow } from "./field-editor-row";
import type { Layer, TemplateSchemaJson } from "@/lib/validations/template";

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
  width: number;
  height: number;
  schemaJson: TemplateSchemaJson;
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

export function TemplateBuilder({ template, initialVersionId }: { template: BuilderTemplate; initialVersionId?: string }) {
  const router = useRouter();
  const sortedVersions = [...template.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const [versionId, setVersionId] = useState(initialVersionId ?? sortedVersions[0]?.id);
  const version = sortedVersions.find((v) => v.id === versionId) ?? sortedVersions[0];

  // Of een versie "live" is, wordt afgeleid van Template.status +
  // activeVersionId — niet van TemplateVersion.status zelf. Dat laatste kan
  // uit de pas lopen (bv. na archiveren/herstellen van de template), en gaf
  // dan een misleidend badge dat niet overeenkwam met het overzicht.
  const isLive = (v: { id: string }) => template.status === "PUBLISHED" && template.activeVersionId === v.id;

  const [fields, setFields] = useState<BuilderField[]>(version.fields);
  const [schema, setSchema] = useState<TemplateSchemaJson>(version.schemaJson);
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
    setFields(v.fields);
    setSchema(v.schemaJson);
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
      if (!res.ok) throw new Error();
      setMessage(publish ? "Template gepubliceerd." : "Wijzigingen opgeslagen.");
      router.refresh();
    } catch {
      setMessage("Opslaan is niet gelukt.");
    } finally {
      setSaving(false);
    }
  }

  async function activateVersion(id: string) {
    await fetch(`/api/admin/templates/${template.id}/versions/${id}/activate`, { method: "POST" });
    router.refresh();
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
              v{version.versionNumber} · {isLive(version) ? "gepubliceerd" : "concept"}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <Button variant="outline" onClick={() => saveVersion(false)} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Opslaan
          </Button>
          <Button onClick={() => saveVersion(true)} disabled={saving}>
            Publiceren
          </Button>
        </div>
      </div>

      {message && <p className="text-sm text-hhc-orange-dark">{message}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <Card className="bg-hhc-black p-4">
            <CardContent className="flex justify-center p-0">
              <DesignCanvas schema={schema} formData={previewFormData} maxWidth={520} maxHeight={640} editable={false} />
            </CardContent>
          </Card>

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

          <div>
            <Label>Lagen (aan/uit zetten door gebruiker)</Label>
            <p className="mb-2 text-xs text-muted-foreground">
              Zet een laag aan om er een schakelaar voor toe te voegen waarmee de gebruiker hem in de wizard zelf kan
              tonen of verbergen (bv. een sponsorlogo of een optionele tekstregel).
            </p>
            <div className="flex flex-col gap-1.5">
              {schema.layers
                .filter((l) => l.type !== "background")
                .map((l) => (
                  <label
                    key={l.id}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(l.visibilityField)}
                      onChange={(e) => toggleLayerVisibility(l.id, e.target.checked)}
                    />
                    <span className="flex-1">{layerLabel(l)}</span>
                    <span className="text-xs uppercase text-muted-foreground">{l.type}</span>
                  </label>
                ))}
              {schema.layers.filter((l) => l.type !== "background").length === 0 && (
                <p className="text-sm text-muted-foreground">Geen lagen gevonden.</p>
              )}
            </div>
          </div>

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
                      <Badge variant={isLive(v) ? "success" : "outline"}>{isLive(v) ? "PUBLISHED" : "DRAFT"}</Badge>
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Gedetecteerde velden ({fields.length})
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
