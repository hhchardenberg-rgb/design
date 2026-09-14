"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Redo2, Undo2, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldControl, type FieldDef } from "./field-control";
import type { TemplateSchemaJson } from "@/lib/validations/template";
import type { ImageFieldValue } from "@/lib/render/imageFit";

const DesignCanvas = dynamic(() => import("@/components/editor/design-canvas").then((m) => m.DesignCanvas), {
  ssr: false,
  loading: () => <div className="aspect-[4/5] w-full animate-pulse rounded-lg bg-surface-muted" />,
});

export type FormData = Record<string, unknown>;

export interface WizardProps {
  templateName: string;
  templateVersionId: string;
  schema: TemplateSchemaJson;
  fields: FieldDef[];
  exportFormats: string[];
  brandColors: { hex: string; name: string }[];
  initialFormData: FormData;
  initialDesignId: string | null;
  matchId?: string | null;
}

export function Wizard({
  templateName,
  templateVersionId,
  schema,
  fields,
  exportFormats,
  brandColors,
  initialFormData,
  initialDesignId,
  matchId,
}: WizardProps) {
  const router = useRouter();
  const [designId, setDesignId] = useState<string | null>(initialDesignId);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [history, setHistory] = useState<FormData[]>([initialFormData]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [format, setFormat] = useState(exportFormats[0] ?? "PNG");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creatingDesign = useRef(false);

  // Concept aanmaken zodat autosave direct iets heeft om naar te schrijven.
  useEffect(() => {
    if (designId || creatingDesign.current) return;
    creatingDesign.current = true;
    fetch("/api/designs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateVersionId, matchId, title: templateName, formData: initialFormData }),
    })
      .then((r) => r.json())
      .then((data) => setDesignId(data.design.id))
      .finally(() => {
        creatingDesign.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId]);

  const commit = useCallback(
    (next: FormData) => {
      setFormData(next);
      setHistory((h) => [...h.slice(0, historyIndex + 1), next]);
      setHistoryIndex((i) => i + 1);
      setDownloadUrl(null);
    },
    [historyIndex]
  );

  function updateField(key: string, value: unknown) {
    commit({ ...formData, [key]: value });
  }

  function undo() {
    if (historyIndex <= 0) return;
    const idx = historyIndex - 1;
    setHistoryIndex(idx);
    setFormData(history[idx]);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    const idx = historyIndex + 1;
    setHistoryIndex(idx);
    setFormData(history[idx]);
  }

  // Autosave (gedebouncet) — voorkomt gegevensverlies (sectie 19).
  useEffect(() => {
    if (!designId) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch(`/api/designs/${designId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formData }),
        });
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [formData, designId]);

  async function handleDownload() {
    if (!designId) return;
    setRendering(true);
    try {
      const res = await fetch(`/api/designs/${designId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, formData }),
      });
      if (!res.ok) throw new Error("render mislukt");
      const data = await res.json();
      setDownloadUrl(data.design.exportUrl);
      router.refresh();
    } catch {
      alert("Het genereren van de afbeelding is niet gelukt. Probeer het opnieuw.");
    } finally {
      setRendering(false);
    }
  }

  const missingRequired = useMemo(
    () =>
      fields.filter((f) => {
        if (!f.required) return false;
        const v = formData[f.key];
        if (f.type === "IMAGE" || f.type === "LOGO") return !(v as ImageFieldValue | undefined)?.assetUrl;
        return !v;
      }),
    [fields, formData]
  );

  const textFields = fields.filter((f) => !["IMAGE", "LOGO", "BRAND_COLOR", "CHECKBOX"].includes(f.type));
  const mediaFields = fields.filter((f) => ["IMAGE", "LOGO"].includes(f.type));
  const otherFields = fields.filter((f) => ["BRAND_COLOR", "CHECKBOX"].includes(f.type));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="order-2 flex flex-col gap-6 lg:order-1">
        <div>
          <h1 className="text-xl font-bold">{templateName}</h1>
          <p className="text-sm text-muted-foreground">Vul de gegevens in — de preview rechts werkt direct mee.</p>
        </div>

        {textFields.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">1. Informatie</h2>
            {textFields.map((f) => (
              <FieldControl key={f.key} field={f} value={formData[f.key]} onChange={(v) => updateField(f.key, v)} brandColors={brandColors} />
            ))}
          </section>
        )}

        {mediaFields.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">2. Foto&apos;s &amp; logo&apos;s</h2>
            {mediaFields.map((f) => (
              <FieldControl key={f.key} field={f} value={formData[f.key]} onChange={(v) => updateField(f.key, v)} brandColors={brandColors} />
            ))}
          </section>
        )}

        {otherFields.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Opties</h2>
            {otherFields.map((f) => (
              <FieldControl key={f.key} field={f} value={formData[f.key]} onChange={(v) => updateField(f.key, v)} brandColors={brandColors} />
            ))}
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">3. Controleren &amp; downloaden</h2>
          {missingRequired.length > 0 && (
            <p className="text-xs text-destructive">
              Nog in te vullen: {missingRequired.map((f) => f.label).join(", ")}
            </p>
          )}
          <div className="flex items-center gap-2">
            {exportFormats.map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setFormat(fmt)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${format === fmt ? "border-primary bg-primary/10 text-hhc-orange-dark" : "border-border text-muted-foreground"}`}
              >
                {fmt}
              </button>
            ))}
          </div>
          <Button size="lg" onClick={handleDownload} disabled={rendering || missingRequired.length > 0}>
            {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {rendering ? "Bezig met genereren..." : "Downloaden"}
          </Button>
          {downloadUrl && (
            <a href={downloadUrl} download target="_blank" rel="noreferrer" className="text-center text-sm font-medium text-hhc-orange-dark hover:underline">
              Klaar! Klik hier als het downloaden niet vanzelf start.
            </a>
          )}
          <p className="text-center text-xs text-muted-foreground">{saving ? "Concept opslaan..." : "Concept opgeslagen"}</p>
        </section>
      </div>

      <div className="order-1 lg:order-2">
        <div className="sticky top-20 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Live preview</p>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" onClick={undo} disabled={historyIndex <= 0} title="Ongedaan maken">
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={redo} disabled={historyIndex >= history.length - 1} title="Opnieuw">
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Card className="overflow-hidden bg-hhc-black p-4">
            <CardContent className="flex items-center justify-center p-0">
              <DesignCanvas
                schema={schema}
                formData={formData}
                maxWidth={620}
                maxHeight={760}
                onImageTransform={(key, value) => updateField(key, value)}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
