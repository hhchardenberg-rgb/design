"use client";

import { Input, Label, Select, Checkbox } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { BuilderField } from "./template-builder";

const TYPES = [
  ["SHORT_TEXT", "Korte tekst"],
  ["LONG_TEXT", "Lange tekst"],
  ["NUMBER", "Getal"],
  ["SCORE", "Score"],
  ["DATE", "Datum"],
  ["TIME", "Tijd"],
  ["DROPDOWN", "Keuzelijst"],
  ["CHECKBOX", "Aan/uit"],
  ["IMAGE", "Afbeelding"],
  ["LOGO", "Logo"],
  ["BRAND_COLOR", "Huisstijlkleur"],
] as const;

const TRANSFORMS = [
  ["NONE", "Geen"],
  ["UPPERCASE", "HOOFDLETTERS"],
  ["LOWERCASE", "kleine letters"],
  ["CAPITALIZE", "Elk Woord Met Hoofdletter"],
] as const;

export function FieldEditorRow({
  field,
  onChange,
}: {
  field: BuilderField;
  onChange: (next: BuilderField) => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-muted-foreground">{field.key}</code>
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={field.required} onChange={(e) => onChange({ ...field, required: e.target.checked })} />
            Verplicht
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Label</Label>
            <Input value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={field.type} onChange={(e) => onChange({ ...field, type: e.target.value })}>
              {TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Standaardwaarde</Label>
            <Input value={field.defaultValue ?? ""} onChange={(e) => onChange({ ...field, defaultValue: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Placeholder</Label>
            <Input value={field.placeholder ?? ""} onChange={(e) => onChange({ ...field, placeholder: e.target.value })} />
          </div>
        </div>

        {["SHORT_TEXT", "LONG_TEXT"].includes(field.type) && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Maximale lengte</Label>
              <Input
                type="number"
                value={field.maxLength ?? ""}
                onChange={(e) => onChange({ ...field, maxLength: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div>
              <Label className="text-xs">Teksttransformatie</Label>
              <Select value={field.textTransform} onChange={(e) => onChange({ ...field, textTransform: e.target.value })}>
                {TRANSFORMS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}

        {field.type === "DROPDOWN" && (
          <div>
            <Label className="text-xs">Keuzes (één per regel, &quot;label = waarde&quot;)</Label>
            <textarea
              className="flex min-h-16 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              value={(field.options ?? []).map((o) => `${o.label} = ${o.value}`).join("\n")}
              onChange={(e) => {
                const options = e.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => {
                    const [label, value] = line.split("=").map((s) => s.trim());
                    return { label: label || value, value: value || label };
                  });
                onChange({ ...field, options });
              }}
            />
          </div>
        )}

        {(field.type === "IMAGE" || field.type === "LOGO") && (
          <div>
            <Label className="text-xs">Weergave</Label>
            <Select value={field.imageFit ?? "cover"} onChange={(e) => onChange({ ...field, imageFit: e.target.value as "contain" | "cover" })}>
              <option value="cover">Vullen (cover)</option>
              <option value="contain">Passend (contain)</option>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
