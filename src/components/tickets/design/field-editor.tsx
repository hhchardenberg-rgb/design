"use client";
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { BLOCKS, FORMAT_LABEL, fieldAllowsLayer, type BlockEntry, type FieldDef, type Layer } from "@/lib/tickets/design/fields";
import { DYNAMIC_FIELDS } from "@/lib/tickets/design/dynamic";
import { originText, type Override, type OverrideMap, type ResolvedField } from "@/lib/tickets/design/resolve";
import { normalizeBlocks } from "@/lib/tickets/design/view";
import { cn } from "@/lib/utils";

export interface AssetOption {
  id: string;
  name: string;
  kind: string;
  url: string;
  width: number;
  height: number;
  version: number;
}
export interface SetOption {
  id: string;
  name: string;
  kind: string;
  publishedVersion: number;
  archived: boolean;
}

type Mode = "inherit" | "value" | "hidden" | "empty";
const MODE_LABEL: Record<Mode, string> = { inherit: "Gebruik bovenliggende instelling", value: "Eigen waarde", hidden: "Niet tonen", empty: "Bewust leeg" };
const MODE_SHORT: Record<Mode, string> = { inherit: "Overerven", value: "Eigen waarde", hidden: "Niet tonen", empty: "Bewust leeg" };

function valueText(f: FieldDef, r: ResolvedField | undefined, assets: AssetOption[], sets: SetOption[]): string {
  if (!r) return "–";
  if (r.state === "hidden") return "Niet tonen";
  if (r.state === "empty") return "Bewust leeg";
  const v = r.value;
  if (v === null || v === undefined || v === "") return f.type === "designSet" ? "Basisontwerp voor deze soort" : "(leeg)";
  switch (f.type) {
    case "bool":
      return v ? "Aan" : "Uit";
    case "select":
    case "font":
    case "weight":
      return f.options?.find((o) => o.value === v)?.label ?? String(v);
    case "asset":
      return v === "builtin:hhc" ? "HHC-logo (officieel)" : assets.find((a) => a.id === v)?.name ?? "Afbeelding";
    case "assets":
      return (v as string[]).map((id) => assets.find((a) => a.id === id)?.name ?? "?").join(", ") || "Geen";
    case "blocks":
      return (v as BlockEntry[]).filter((b) => b.visible).map((b) => BLOCKS[b.id]?.label).join(" › ");
    case "designSet":
      return sets.find((s) => s.id === v)?.name ?? "Ontwerpset";
    case "number":
      return `${v}${f.unit ? ` ${f.unit}` : ""}`;
    default:
      return String(v);
  }
}

/**
 * Eén instelling: effectieve waarde met herkomst, de drie keuzes (overerven, eigen waarde, niet tonen
 * of bewust leeg), voor welk formaat de afwijking geldt, en herstellen.
 */
export function FieldEditor(props: {
  field: FieldDef;
  /** Effectieve waarde per formaat (met het concept van dit niveau). */
  resolved: { mobile?: ResolvedField; a4?: ResolvedField };
  /** Waarde zonder dit niveau (wat er staat als je overerft). */
  parent: { mobile?: ResolvedField; a4?: ResolvedField };
  overrides: OverrideMap;
  scopeKey: string;
  readOnly: boolean;
  advanced: boolean;
  assets: AssetOption[];
  sets: SetOption[];
  onChange: (layer: Layer, o: Override | undefined) => void;
  onUpload?: (kind: string) => void;
}) {
  const { field: f, overrides, readOnly } = props;
  const layers: Layer[] = (["shared", "mobile", "a4"] as Layer[]).filter((l) => fieldAllowsLayer(f, l));
  const present = layers.filter((l) => overrides[l]?.[f.key]);
  const [layer, setLayer] = useState<Layer>(present[0] ?? (f.formats === "both" || f.type === "designSet" ? "shared" : f.formats));
  const o = overrides[layer]?.[f.key];
  const mode: Mode = !o ? "inherit" : o.m;
  const shown = layer === "a4" ? props.resolved.a4 : props.resolved.mobile ?? props.resolved.a4;
  const parentShown = layer === "a4" ? props.parent.a4 : props.parent.mobile ?? props.parent.a4;
  const modes: Mode[] = ["inherit", "value", ...(f.allowHidden ? (["hidden"] as Mode[]) : []), ...(f.allowEmpty ? (["empty"] as Mode[]) : [])];
  const differs = props.resolved.mobile && props.resolved.a4 && JSON.stringify(props.resolved.mobile.value) !== JSON.stringify(props.resolved.a4.value);
  const id = `f-${f.key.replace(/\./g, "-")}`;

  const setMode = (m: Mode) => {
    if (m === "inherit") return props.onChange(layer, undefined);
    if (m === "hidden" || m === "empty") return props.onChange(layer, { m });
    // Start met de huidige effectieve waarde, zodat er niets verspringt.
    const start = parentShown?.state === "value" ? parentShown.value : shown?.value;
    props.onChange(layer, { m: "value", v: start ?? fallbackValue(f) });
  };

  return (
    <div className={cn("rounded-lg border p-3", mode !== "inherit" ? "border-primary/60 bg-primary/5" : "border-border")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <label htmlFor={id} className="text-sm font-semibold">
            {f.label}
          </label>
          {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
        </div>
        {present.length > 0 && !readOnly && (
          <Button type="button" variant="ghost" size="sm" onClick={() => present.forEach((l) => props.onChange(l, undefined))} title="Herstel bovenliggende instelling">
            <RotateCcw className="h-3.5 w-3.5" /> Herstel
          </Button>
        )}
      </div>

      <p className="mt-1 text-xs">
        <span className="font-medium">Nu: {valueText(f, shown, props.assets, props.sets)}</span>
        <span className="text-muted-foreground"> · {shown ? originText(shown.origin, props.scopeKey) : ""}</span>
        {differs && <span className="text-muted-foreground"> · mobiel en A4 verschillen</span>}
      </p>

      {layers.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs" role="radiogroup" aria-label="Geldt voor">
          <span className="mr-1 text-muted-foreground">Geldt voor:</span>
          {layers.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={layer === l} onClick={() => setLayer(l)} className={cn("rounded-full border px-2.5 py-1", layer === l ? "border-foreground bg-foreground text-background" : "border-border")}>
              {FORMAT_LABEL[l]}
              {overrides[l]?.[f.key] ? " •" : ""}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2">
        <Select aria-label={`Keuze voor ${f.label}`} value={mode} disabled={readOnly} onChange={(e) => setMode(e.target.value as Mode)} className="h-9 text-sm">
          {modes.map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
              {m === "inherit" && parentShown ? ` (${valueText(f, parentShown, props.assets, props.sets).replace(/^\((.*)\)$/, "$1")})` : ""}
            </option>
          ))}
        </Select>
        {mode === "empty" && <p className="mt-1 text-xs text-muted-foreground">Bewust leeg: dit element blijft weg, zonder vervangende tekst; de rest van het blok blijft staan.</p>}
        {mode === "hidden" && <p className="mt-1 text-xs text-muted-foreground">Niet tonen: het element{f.hidesBlock ? " en het hele blok" : ""} verdwijnt.</p>}
      </div>

      {mode === "value" && o?.m === "value" && (
        <div className="mt-2">
          <ValueInput id={id} field={f} value={o.v} readOnly={readOnly} assets={props.assets} sets={props.sets} onChange={(v) => props.onChange(layer, { m: "value", v })} onUpload={props.onUpload} />
        </div>
      )}
    </div>
  );
}

function fallbackValue(f: FieldDef): unknown {
  if (f.type === "assets") return [];
  if (f.type === "bool") return false;
  if (f.type === "text" || f.type === "longtext") return "";
  if (f.type === "number") return f.min ?? 0;
  if (f.type === "color") return "#000000";
  return f.options?.[0]?.value ?? f.default;
}

function ValueInput({ id, field: f, value, readOnly, assets, sets, onChange, onUpload }: { id: string; field: FieldDef; value: unknown; readOnly: boolean; assets: AssetOption[]; sets: SetOption[]; onChange: (v: unknown) => void; onUpload?: (kind: string) => void }) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  switch (f.type) {
    case "color":
      return (
        <div className="flex items-center gap-2">
          <input type="color" aria-label={f.label} value={typeof value === "string" ? value : "#000000"} disabled={readOnly} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-9 w-12 cursor-pointer rounded border" />
          <Input id={id} value={typeof value === "string" ? value : ""} disabled={readOnly} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-9 w-32 font-mono" maxLength={7} />
          <div className="flex gap-1" aria-label="Huisstijlkleuren">
            {["#FF6F00", "#000000", "#FFFFFF"].map((c) => (
              <button key={c} type="button" title={c === "#FF6F00" ? "HHC-oranje" : c === "#000000" ? "Zwart" : "Wit"} aria-label={c === "#FF6F00" ? "HHC-oranje" : c === "#000000" ? "Zwart" : "Wit"} disabled={readOnly} onClick={() => onChange(c)} className="h-7 w-7 rounded-full border" style={{ background: c }} />
            ))}
          </div>
        </div>
      );
    case "number":
      return (
        <div className="flex items-center gap-3">
          <input type="range" aria-label={f.label} min={f.min} max={f.max} step={f.step} value={Number(value)} disabled={readOnly} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[var(--hhc-orange)]" />
          <Input id={id} type="number" min={f.min} max={f.max} step={f.step} value={Number(value)} disabled={readOnly} onChange={(e) => onChange(Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, Number(e.target.value))))} className="h-9 w-24" />
          {f.unit && <span className="text-xs text-muted-foreground">{f.unit}</span>}
        </div>
      );
    case "bool":
      return (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox id={id} checked={value === true} disabled={readOnly} onChange={(e) => onChange(e.target.checked)} /> {value ? "Aan" : "Uit"}
        </label>
      );
    case "select":
    case "font":
    case "weight":
      return (
        <Select id={id} value={String(value)} disabled={readOnly} onChange={(e) => onChange(e.target.value)} className="h-9">
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    case "text":
    case "longtext": {
      const insert = (key: string) => {
        const el = ref.current;
        const cur = String(value ?? "");
        const token = `{{${key}}}`;
        const at = el?.selectionStart ?? cur.length;
        onChange(cur.slice(0, at) + token + cur.slice(el?.selectionEnd ?? at));
      };
      return (
        <div className="space-y-1.5">
          {f.type === "text" ? (
            <Input id={id} ref={ref} value={String(value ?? "")} maxLength={f.maxLength} disabled={readOnly} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <Textarea id={id} ref={ref} rows={3} value={String(value ?? "")} maxLength={f.maxLength} disabled={readOnly} onChange={(e) => onChange(e.target.value)} />
          )}
          {f.dynamic && !readOnly && (
            <Select aria-label="Gegeven invoegen" value="" onChange={(e) => e.target.value && insert(e.target.value)} className="h-8 text-xs">
              <option value="">+ Gegeven invoegen…</option>
              {DYNAMIC_FIELDS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}: {d.help} (bijv. {d.sample})
                </option>
              ))}
            </Select>
          )}
          {f.maxLength && <p className="text-right text-[11px] text-muted-foreground">{String(value ?? "").length}/{f.maxLength}</p>}
        </div>
      );
    }
    case "asset": {
      const options = assets.filter((a) => a.kind === f.assetKind);
      return (
        <div className="space-y-2">
          <Select id={id} value={String(value ?? "")} disabled={readOnly} onChange={(e) => onChange(e.target.value)} className="h-9">
            {f.key === "logo.club" && <option value="builtin:hhc">HHC-logo (officieel, uit de Hub)</option>}
            {!options.length && f.key !== "logo.club" && <option value="">Nog geen afbeeldingen: upload er een</option>}
            {options.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.width}×{a.height}, versie {a.version})
              </option>
            ))}
          </Select>
          {onUpload && !readOnly && (
            <Button type="button" variant="outline" size="sm" onClick={() => onUpload(f.assetKind ?? "PHOTO")}>
              Afbeelding uploaden
            </Button>
          )}
        </div>
      );
    }
    case "assets": {
      const list = Array.isArray(value) ? (value as string[]) : [];
      const options = assets.filter((a) => a.kind === f.assetKind && !list.includes(a.id));
      const move = (i: number, d: number) => {
        const next = [...list];
        const [x] = next.splice(i, 1);
        next.splice(i + d, 0, x);
        onChange(next);
      };
      return (
        <div className="space-y-2">
          <ol className="space-y-1">
            {list.map((id, i) => {
              const a = assets.find((x) => x.id === id);
              return (
                <li key={id} className="flex items-center gap-2 rounded border bg-surface px-2 py-1 text-sm">
                  {a && <img src={a.url} alt="" className="h-7 w-14 object-contain" />}
                  <span className="min-w-0 flex-1 truncate">{a?.name ?? "Onbekend"}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Omhoog" disabled={readOnly || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Omlaag" disabled={readOnly || i === list.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`${a?.name ?? "Logo"} verwijderen`} disabled={readOnly} onClick={() => onChange(list.filter((x) => x !== id))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
            {!list.length && <li className="text-xs text-muted-foreground">Nog geen logo&apos;s gekozen.</li>}
          </ol>
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Select aria-label="Logo toevoegen" value="" onChange={(e) => e.target.value && onChange([...list, e.target.value])} className="h-8 max-w-xs text-xs" disabled={(f.max ?? 99) <= list.length}>
                <option value="">+ Logo toevoegen…</option>
                {options.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              {onUpload && (
                <Button type="button" variant="outline" size="sm" onClick={() => onUpload(f.assetKind ?? "SPONSOR")}>
                  Uploaden
                </Button>
              )}
            </div>
          )}
        </div>
      );
    }
    case "blocks": {
      const list = normalizeBlocks(Array.isArray(value) ? (value as BlockEntry[]) : []);
      const move = (i: number, d: number) => {
        const next = [...list];
        const [x] = next.splice(i, 1);
        next.splice(i + d, 0, x);
        onChange(next);
      };
      return (
        <ol className="space-y-1" aria-label="Blokken in volgorde">
          {list.map((b, i) => (
            <li key={b.id} className={cn("flex items-center gap-2 rounded border px-2 py-1 text-sm", !b.visible && "opacity-60")}>
              <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1">
                {BLOCKS[b.id].label}
                {BLOCKS[b.id].protected && <span className="ml-1 text-[11px] text-muted-foreground">(altijd zichtbaar)</span>}
              </span>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`${BLOCKS[b.id].label} omhoog`} disabled={readOnly || i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`${BLOCKS[b.id].label} omlaag`} disabled={readOnly || i === list.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={b.visible ? `${BLOCKS[b.id].label} verbergen` : `${BLOCKS[b.id].label} tonen`} aria-pressed={b.visible} disabled={readOnly || BLOCKS[b.id].protected} onClick={() => onChange(list.map((x) => (x.id === b.id ? { ...x, visible: !x.visible } : x)))}>
                {b.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </Button>
            </li>
          ))}
        </ol>
      );
    }
    case "designSet": {
      const options = sets.filter((s) => s.publishedVersion > 0 && !s.archived && (f.kinds ? f.kinds.includes(s.kind as never) : true));
      return (
        <Select id={id} value={String(value ?? "")} disabled={readOnly} onChange={(e) => onChange(e.target.value)} className="h-9">
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} (versie {s.publishedVersion})
            </option>
          ))}
        </Select>
      );
    }
  }
}

export { MODE_SHORT };
