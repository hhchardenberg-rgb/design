"use client";

import { AlignCenter, AlignLeft, AlignRight, Move, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Layer } from "@/lib/validations/template";
import { allows, fontSizeRange, type LayerOverride } from "@/lib/design/layer-overrides";
import { cn } from "@/lib/utils";

/**
 * Wat de invuller aan de gekozen laag zelf mag aanpassen, zoals ingesteld in
 * de builder: positie en formaat (slepen in de preview), tekstkleur uit de
 * huisstijl, lettergrootte en uitlijning.
 */
export function LayerAdjustPanel({
  layer,
  effective,
  override,
  brandColors,
  adjusting,
  onToggleAdjust,
  onChange,
  onReset,
}: {
  /** De laag zoals in de template. */
  layer: Layer;
  /** De laag met de huidige aanpassingen. */
  effective: Layer;
  override: LayerOverride | undefined;
  brandColors: { hex: string; name: string }[];
  adjusting: boolean;
  onToggleAdjust: () => void;
  onChange: (patch: LayerOverride) => void;
  onReset: () => void;
}) {
  const geometry = allows(layer, "move") || allows(layer, "resize");
  const text = layer.type === "text" && effective.type === "text" ? { layer, effective } : null;
  const colors = text
    ? [...new Map([[text.layer.color.toUpperCase(), "Origineel"], ...brandColors.map((c) => [c.hex.toUpperCase(), c.name] as const)]).entries()]
    : [];

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Opmaak van {layer.name ?? "deze laag"}</p>
          {override && (
            <Button size="sm" variant="ghost" onClick={onReset}>
              <RotateCcw className="h-3.5 w-3.5" /> Herstellen
            </Button>
          )}
        </div>

        {geometry && (
          <div className="flex flex-col gap-1">
            <Button size="sm" variant={adjusting ? "primary" : "outline"} onClick={onToggleAdjust} className="self-start">
              <Move className="h-4 w-4" /> {adjusting ? "Klaar met verplaatsen" : allows(layer, "resize") ? "Verplaatsen en schalen" : "Verplaatsen"}
            </Button>
            {adjusting && (
              <p className="text-xs text-muted-foreground">
                Sleep het kader in de preview{allows(layer, "resize") ? " of gebruik de hoekpunten om het groter of kleiner te maken" : ""}.
              </p>
            )}
          </div>
        )}

        {text && allows(layer, "color") && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Tekstkleur</span>
            <div className="flex flex-wrap gap-2">
              {colors.map(([hex, name]) => {
                const active = text.effective.color.toUpperCase() === hex;
                return (
                  <button
                    key={hex}
                    type="button"
                    title={name}
                    aria-label={name}
                    aria-pressed={active}
                    onClick={() => onChange({ color: hex })}
                    className={cn("h-8 w-8 rounded-full border border-border", active && "ring-2 ring-hhc-orange ring-offset-2")}
                    style={{ backgroundColor: hex }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {text && allows(layer, "fontSize") && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Lettergrootte ({Math.round(text.effective.fontSize)})
            <input
              type="range"
              min={fontSizeRange(text.layer).min}
              max={fontSizeRange(text.layer).max}
              step={1}
              value={Math.round(text.effective.fontSize)}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
              className="accent-hhc-orange"
            />
          </label>
        )}

        {text && allows(layer, "align") && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Uitlijnen</span>
            <div className="flex gap-1">
              {(
                [
                  ["left", AlignLeft, "Links"],
                  ["center", AlignCenter, "Midden"],
                  ["right", AlignRight, "Rechts"],
                ] as const
              ).map(([value, Icon, label]) => (
                <Button
                  key={value}
                  size="icon"
                  variant={text.effective.align === value ? "primary" : "outline"}
                  aria-label={label}
                  title={label}
                  onClick={() => onChange({ align: value })}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
