"use client";

import { Badge } from "@/components/ui/badge";
import { Label, Select } from "@/components/ui/input";
import type { TextLayer } from "@/lib/validations/template";
import { faceLabel, resolveFontFace, type FontFaceInfo, type FontResolutionStatus } from "@/lib/fonts/faces";

const STATUS: Record<FontResolutionStatus, { label: string; variant: "success" | "primary" | "outline" }> = {
  exact: { label: "Vastgelegd", variant: "success" },
  matched: { label: "Gevonden", variant: "success" },
  substitute: { label: "Vervanger", variant: "primary" },
  missing: { label: "Ontbreekt", variant: "primary" },
};

/**
 * Per tekstlaag: welk fontbestand wordt gebruikt en hoe de tekst verticaal
 * in het kader staat. Bij activeren wordt de keuze vastgelegd.
 */
export function TextFontPanel({
  layers,
  faces,
  locked,
  onChange,
}: {
  layers: TextLayer[];
  faces: FontFaceInfo[];
  locked: boolean;
  onChange: (layerId: string, patch: Partial<TextLayer>) => void;
}) {
  if (layers.length === 0) return null;

  return (
    <div>
      <Label>Lettertypen per tekstlaag</Label>
      <p className="mb-2 text-xs text-muted-foreground">
        Elke tekstlaag gebruikt één fontbestand. Ontbreekt een lettertype, upload het dan eerst bij Lettertypen; zonder
        lettertype kan de versie niet geactiveerd worden.
      </p>
      <div className="flex flex-col gap-2">
        {layers.map((layer) => {
          const { face, status, message } = resolveFontFace(layer, faces);
          const choices = faces.filter((f) => f.active || f.id === face.id);
          const badge = STATUS[status];
          return (
            <div key={layer.id} className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{layer.name ?? layer.id}</span>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
              {layer.fontPostscriptName && (
                <span className="text-xs text-muted-foreground">In de PSD: {layer.fontPostscriptName}</span>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]">
                <Select
                  aria-label={`Lettertype voor ${layer.name ?? layer.id}`}
                  value={face.id}
                  disabled={locked}
                  onChange={(e) => {
                    const next = faces.find((f) => f.id === e.target.value);
                    if (!next) return;
                    onChange(layer.id, {
                      fontFaceId: next.id,
                      fontFamily: next.family,
                      fontWeight: next.weight,
                      fontStyle: next.style,
                    });
                  }}
                >
                  {choices.map((f) => (
                    <option key={f.id} value={f.id}>
                      {faceLabel(f)}
                      {f.builtin ? " (standaard)" : ""}
                      {!f.active ? " (uitgezet)" : ""}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label={`Verticale uitlijning voor ${layer.name ?? layer.id}`}
                  value={layer.verticalAlign ?? "middle"}
                  disabled={locked}
                  onChange={(e) => onChange(layer.id, { verticalAlign: e.target.value as TextLayer["verticalAlign"] })}
                >
                  <option value="top">Boven</option>
                  <option value="middle">Midden</option>
                  <option value="bottom">Onder</option>
                </Select>
              </div>
              {message && <span className="text-xs text-hhc-orange-dark">{message}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
