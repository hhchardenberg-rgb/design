"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, Image as ImageIcon, Lock, Square, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import type { Layer, LayerPermission, TextLayer } from "@/lib/validations/template";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<Layer["type"], string> = {
  background: "Achtergrond",
  static_image: "Vast",
  text: "Tekst",
  image: "Foto",
  color: "Kleurvlak",
};

/**
 * Lagenlijst van de builder: bovenste laag bovenaan, zoals in Photoshop.
 * Klikken kiest de laag (ook lagen die onder andere liggen).
 */
export function LayerList({
  layers,
  selectedId,
  label,
  locked,
  onSelect,
  onMove,
  onDelete,
  onToggleVisibility,
}: {
  layers: Layer[];
  selectedId: string | null;
  label: (layer: Layer) => string;
  locked: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string, enabled: boolean) => void;
}) {
  const ordered = [...layers].reverse();
  return (
    <div className="flex flex-col gap-1">
      {ordered.map((l, i) => {
        const isBackground = l.type === "background";
        const selected = l.id === selectedId;
        return (
          <div
            key={l.id}
            className={cn(
              "flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm",
              selected ? "border-hhc-orange bg-hhc-orange/10" : "border-border"
            )}
          >
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelect(l.id)}>
              <LayerIcon type={l.type} />
              <span className="truncate">{label(l)}</span>
              <span className="ml-auto shrink-0 text-[10px] uppercase text-muted-foreground">{TYPE_LABELS[l.type]}</span>
            </button>
            {!isBackground && (
              <label className="flex items-center gap-1 text-xs text-muted-foreground" title="De gebruiker kan deze laag tonen of verbergen">
                <input
                  type="checkbox"
                  checked={Boolean(l.visibilityField)}
                  disabled={locked}
                  onChange={(e) => onToggleVisibility(l.id, e.target.checked)}
                />
                <Eye className="h-3.5 w-3.5" />
              </label>
            )}
            {!isBackground && !locked && (
              <>
                <IconButton label="Omhoog" disabled={i === 0} onClick={() => onMove(l.id, "up")}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Omlaag" disabled={ordered[i + 1]?.type === "background" || i === ordered.length - 1} onClick={() => onMove(l.id, "down")}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label="Verwijderen" onClick={() => onDelete(l.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LayerIcon({ type }: { type: Layer["type"] }) {
  const cls = "h-4 w-4 shrink-0 text-muted-foreground";
  if (type === "text") return <Type className={cls} />;
  if (type === "image") return <ImageIcon className={cls} />;
  if (type === "color") return <Square className={cls} />;
  return <Lock className={cls} />;
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Getalveld dat pas bij Enter of verlaten doorgeeft (één stap in "ongedaan maken"). */
function NumberField({
  label,
  value,
  onCommit,
  step = 1,
  min,
  max,
  disabled,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft.replace(",", "."));
    setDraft(null);
    if (!Number.isFinite(v)) return;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type="text"
        inputMode="decimal"
        className="h-8"
        disabled={disabled}
        value={draft ?? String(Math.round(value * 10) / 10)}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
      />
    </label>
  );
}

const GEOMETRY_KEYS = ["height", "fontSize", "lineHeight", "verticalAlign"] as const;

/**
 * Eigenschappen van de gekozen laag. `onChange` krijgt een gedeeltelijke
 * laag. Verandert de hoogte of de tekstopmaak, dan vervalt de vaste
 * Photoshop-basislijn (de tekst volgt dan weer de uitlijning in het kader).
 */
export function LayerProperties({
  layer,
  locked,
  fieldLabel,
  onChange,
}: {
  layer: Layer;
  locked: boolean;
  fieldLabel?: string;
  onChange: (patch: Partial<Layer>) => void;
}) {
  const change = (patch: Record<string, unknown>) => {
    const next = { ...patch } as Record<string, unknown>;
    if (layer.type === "text" && layer.psdBaseline && GEOMETRY_KEYS.some((k) => k in patch)) next.psdBaseline = undefined;
    onChange(next as Partial<Layer>);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="mb-0">Eigenschappen: {layer.name ?? layer.id}</Label>
        <span className="text-xs uppercase text-muted-foreground">{TYPE_LABELS[layer.type]}</span>
      </div>
      {fieldLabel && <p className="text-xs text-muted-foreground">Gekoppeld aan veld &ldquo;{fieldLabel}&rdquo;</p>}
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Naam
        <Input className="h-8" value={layer.name ?? ""} disabled={locked} onChange={(e) => change({ name: e.target.value || undefined })} />
      </label>
      <div className="grid grid-cols-4 gap-2">
        <NumberField label="X" value={layer.x} disabled={locked} onCommit={(x) => change({ x })} />
        <NumberField label="Y" value={layer.y} disabled={locked} onCommit={(y) => change({ y })} />
        <NumberField label="Breedte" value={layer.width} min={1} disabled={locked} onCommit={(width) => change({ width })} />
        <NumberField label="Hoogte" value={layer.height} min={1} disabled={locked} onCommit={(height) => change({ height })} />
        <NumberField label="Draaiing °" value={layer.rotation ?? 0} min={-360} max={360} disabled={locked} onCommit={(rotation) => change({ rotation })} />
        <NumberField
          label="Dekking %"
          value={Math.round((layer.opacity ?? 1) * 100)}
          min={0}
          max={100}
          disabled={locked}
          onCommit={(v) => change({ opacity: v / 100 })}
        />
      </div>

      {layer.type === "text" && <TextProperties layer={layer} locked={locked} change={change} />}

      {layer.type !== "background" && layer.type !== "static_image" && (
        <Permissions layer={layer} locked={locked} onChange={(allow) => change({ allow: allow.length ? allow : undefined })} />
      )}

      {(layer.type === "image" || layer.type === "color") && (
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Vorm
            <Select className="h-8" value={layer.shape} disabled={locked} onChange={(e) => change({ shape: e.target.value })}>
              <option value="rect">Rechthoek</option>
              <option value="circle">Rond</option>
            </Select>
          </label>
          <NumberField label="Hoekafronding" value={layer.cornerRadius} min={0} disabled={locked || layer.shape === "circle"} onCommit={(cornerRadius) => change({ cornerRadius })} />
          {layer.type === "image" ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Vullen
              <Select className="h-8" value={layer.fit} disabled={locked} onChange={(e) => change({ fit: e.target.value })}>
                <option value="cover">Kader vullen</option>
                <option value="contain">Helemaal tonen</option>
              </Select>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Standaardkleur
              <Input type="color" className="h-8 p-1" value={layer.defaultColor} disabled={locked} onChange={(e) => change({ defaultColor: e.target.value })} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

const PERMISSIONS: { key: LayerPermission; label: string; text?: boolean }[] = [
  { key: "move", label: "Verplaatsen" },
  { key: "resize", label: "Formaat aanpassen" },
  { key: "color", label: "Tekstkleur (huisstijl)", text: true },
  { key: "fontSize", label: "Lettergrootte", text: true },
  { key: "align", label: "Uitlijning", text: true },
];

/** Wat de invuller in de editor zelf aan deze laag mag veranderen. */
function Permissions({ layer, locked, onChange }: { layer: Layer; locked: boolean; onChange: (allow: LayerPermission[]) => void }) {
  const current = layer.allow ?? [];
  const options = PERMISSIONS.filter((p) => !p.text || layer.type === "text");
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-2">
      <span className="text-xs font-medium">Invuller mag aanpassen</span>
      <div className="grid grid-cols-2 gap-1">
        {options.map((p) => (
          <label key={p.key} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={current.includes(p.key)}
              disabled={locked}
              onChange={(e) => onChange(e.target.checked ? [...current, p.key] : current.filter((k) => k !== p.key))}
            />
            {p.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function TextProperties({ layer, locked, change }: { layer: TextLayer; locked: boolean; change: (patch: Record<string, unknown>) => void }) {
  return (
    <>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Voorbeeldtekst
        <Input className="h-8" value={layer.text ?? ""} disabled={locked} onChange={(e) => change({ text: e.target.value || undefined })} />
      </label>
      <div className="grid grid-cols-4 gap-2">
        <NumberField label="Grootte" value={layer.fontSize} min={1} disabled={locked} onCommit={(fontSize) => change({ fontSize, minFontSize: Math.min(layer.minFontSize, fontSize) })} />
        <NumberField label="Minimaal" value={layer.minFontSize} min={1} max={layer.fontSize} disabled={locked} onCommit={(minFontSize) => change({ minFontSize })} />
        <NumberField label="Regels" value={layer.maxLines} min={1} max={4} disabled={locked} onCommit={(maxLines) => change({ maxLines: Math.round(maxLines) })} />
        <NumberField label="Regelafstand" value={layer.lineHeight} step={0.05} min={0.5} max={3} disabled={locked} onCommit={(lineHeight) => change({ lineHeight })} />
        <NumberField label="Letterafstand" value={layer.letterSpacing} step={0.5} disabled={locked} onCommit={(letterSpacing) => change({ letterSpacing })} />
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Uitlijnen
          <Select className="h-8" value={layer.align} disabled={locked} onChange={(e) => change({ align: e.target.value })}>
            <option value="left">Links</option>
            <option value="center">Midden</option>
            <option value="right">Rechts</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Verticaal
          <Select className="h-8" value={layer.verticalAlign ?? "middle"} disabled={locked} onChange={(e) => change({ verticalAlign: e.target.value })}>
            <option value="top">Boven</option>
            <option value="middle">Midden</option>
            <option value="bottom">Onder</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Kleur
          <Input type="color" className="h-8 p-1" value={/^#[0-9a-f]{6}$/i.test(layer.color) ? layer.color : "#ffffff"} disabled={locked} onChange={(e) => change({ color: e.target.value })} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={layer.uppercase} disabled={locked} onChange={(e) => change({ uppercase: e.target.checked })} />
        Altijd hoofdletters
      </label>
      {layer.psdBaseline && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-surface-muted px-2 py-1.5 text-xs">
          <span>Staat exact op de Photoshop-basislijn.</span>
          {!locked && (
            <Button size="sm" variant="ghost" onClick={() => change({ psdBaseline: undefined })}>
              Loslaten
            </Button>
          )}
        </div>
      )}
    </>
  );
}
