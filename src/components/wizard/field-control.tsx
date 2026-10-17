"use client";

import { Input, Label, Select, Textarea, Checkbox } from "@/components/ui/input";
import { ImageFieldControl } from "./image-field-control";
import type { ImageFieldValue } from "@/lib/render/imageFit";
import { formatDutchDate, parseDutchDate } from "@/lib/design/dutch-date";

export interface FieldDef {
  key: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string | null;
  maxLength?: number | null;
  options?: { label: string; value: string }[] | null;
  textTransform?: string;
  defaultValue?: string | null;
}

export function FieldControl(props: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown, coalesceKey?: string) => void;
  onReset?: () => void;
  brandColors: { hex: string; name: string }[];
  selected?: boolean;
  onFocusField?: () => void;
}) {
  const { field, value, onReset, selected, onFocusField } = props;
  const isDefault =
    field.type === "CHECKBOX"
      ? (value !== false && value !== "false") === (field.defaultValue !== "false")
      : field.type === "IMAGE" || field.type === "LOGO"
        ? !value || !(value as ImageFieldValue).assetUrl
        : (value ?? "") === (field.defaultValue ?? "");
  return (
    <div
      id={`field-${field.key}`}
      onFocus={onFocusField}
      className={`relative scroll-mt-24 rounded-md transition-shadow ${selected ? "ring-2 ring-primary ring-offset-4 ring-offset-background" : ""}`}
    >
      <FieldInput {...props} />
      {onReset && !isDefault && (
        <button
          type="button"
          onClick={onReset}
          className="absolute right-0 top-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-[var(--hhc-orange)]"
          aria-label={`${field.label} terugzetten naar standaard`}
        >
          Standaard
        </button>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange: rawOnChange,
  brandColors,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown, coalesceKey?: string) => void;
  brandColors: { hex: string; name: string }[];
}) {
  // Doortypen in één veld telt als één stap in ongedaan maken.
  const onChange = (v: unknown) => rawOnChange(v, `field:${field.key}`);
  switch (field.type) {
    case "LONG_TEXT":
      return (
        <div>
          <Label htmlFor={field.key}>
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <Textarea
            id={field.key}
            value={(value as string) ?? ""}
            maxLength={field.maxLength ?? undefined}
            placeholder={field.placeholder ?? undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "NUMBER":
    case "SCORE":
      return (
        <div>
          <Label htmlFor={field.key}>
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={field.key}
            type="number"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "DATE":
      return (
        <div>
          <Label htmlFor={field.key}>
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={field.key}
            type="date"
            value={parseDutchDate((value as string) ?? "") ?? ""}
            onChange={(e) => onChange(e.target.value ? formatDutchDate(e.target.value) : "")}
          />
          {typeof value === "string" && value && (
            <p className="mt-1 text-xs text-muted-foreground">
              Op de afbeelding: {value}
              {!parseDutchDate(value) && " (kies een datum om dit te vervangen)"}
            </p>
          )}
        </div>
      );
    case "TIME":
      return (
        <div>
          <Label htmlFor={field.key}>
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={field.key}
            type="time"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "DROPDOWN":
      return (
        <div>
          <Label htmlFor={field.key}>{field.label}</Label>
          <Select id={field.key} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
            <option value="">Kies...</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
      );
    case "CHECKBOX":
      return (
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox checked={value !== false && value !== "false"} onChange={(e) => rawOnChange(e.target.checked)} />
          {field.label}
        </label>
      );
    case "IMAGE":
    case "LOGO":
      return (
        <ImageFieldControl
          fieldKey={field.key}
          label={field.label}
          value={value as ImageFieldValue}
          onChange={(v, coalesceKey) => rawOnChange(v, coalesceKey)}
        />
      );
    case "BRAND_COLOR":
      return (
        <div>
          <Label>{field.label}</Label>
          <div className="flex flex-wrap gap-2">
            {brandColors.map((c) => (
              <button
                key={c.hex}
                type="button"
                title={c.name}
                onClick={() => rawOnChange(c.hex)}
                aria-label={c.name}
                aria-pressed={value === c.hex}
                className="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
                style={{ backgroundColor: c.hex, borderColor: value === c.hex ? "var(--hhc-orange)" : "transparent" }}
              />
            ))}
          </div>
        </div>
      );
    default:
      return (
        <div>
          <Label htmlFor={field.key}>
            {field.label} {field.required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={field.key}
            value={(value as string) ?? ""}
            maxLength={field.maxLength ?? undefined}
            placeholder={field.placeholder ?? undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
  }
}
