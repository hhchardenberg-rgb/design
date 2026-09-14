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
import type { TemplateSchemaJson } from "@/lib/validations/template";

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
  versions: BuilderVersion[];
}

const EXPORT_FORMATS = ["PNG", "JPG", "WEBP"];

export function TemplateBuilder({ template, initialVersionId }: { template: BuilderTemplate; initialVersionId?: string }) {
  const router = useRouter();
  const sortedVersions = [...template.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const [versionId, setVersionId] = useState(initialVersionId ?? sortedVersions[0]?.id);
  const version = sortedVersions.find((v) => v.id === versionId) ?? sortedVersions[0];

  const [fields, setFields] = useState<BuilderField[]>(version.fields);
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
    setExportFormats(v.exportFormats);
  }

  function updateField(index: number, next: BuilderField) {
    setFields((prev) => prev.map((f, i) => (i === index ? next : f)));
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
            <Badge variant={version.status === "PUBLISHED" ? "success" : "outline"}>
              v{version.versionNumber} · {version.status === "PUBLISHED" ? "gepubliceerd" : "concept"}
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
              <DesignCanvas schema={version.schemaJson} formData={previewFormData} maxWidth={520} maxHeight={640} editable={false} />
            </CardContent>
          </Card>

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
                      <Badge variant={v.status === "PUBLISHED" ? "success" : "outline"}>{v.status}</Badge>
                      {v.status !== "PUBLISHED" && (
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
