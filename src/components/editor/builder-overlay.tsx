"use client";

import { useEffect, useRef, useState } from "react";
import { Layer, Line, Rect, Transformer } from "react-konva";
import type Konva from "konva";
import type { Layer as SchemaLayer, TemplateSchemaJson } from "@/lib/validations/template";

export interface LayerGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface BuilderCanvasProps {
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onChangeLayer: (layerId: string, geometry: LayerGeometry) => void;
  /** Alleen deze lagen zijn te bewerken (editor van de invuller). */
  only?: string[];
  canMove?: (layer: SchemaLayer) => boolean;
  canResize?: (layer: SchemaLayer) => boolean;
  /** Draaien toestaan (standaard aan). */
  rotate?: boolean;
}

/** Afstand (in schermpixels) waarbinnen een rand of midden vastklikt. */
const SNAP_PX = 6;

/**
 * Bewerkingslaag van de templatebuilder, boven de gewone weergave: klikken
 * kiest een laag, slepen verplaatst, de grepen schalen en draaien. Randen en
 * middens klikken vast aan het canvas en aan andere lagen (hulplijnen).
 * Wijzigingen gaan pas bij loslaten naar `onChangeLayer`.
 */
export function BuilderOverlay({
  schema,
  scale,
  builder,
}: {
  schema: TemplateSchemaJson;
  scale: number;
  builder: BuilderCanvasProps;
}) {
  const nodes = useRef(new Map<string, Konva.Rect>());
  const transformer = useRef<Konva.Transformer>(null);
  const [guides, setGuides] = useState<{ vertical: number[]; horizontal: number[] }>({ vertical: [], horizontal: [] });
  const editable = schema.layers.filter((l) => l.type !== "background" && (!builder.only || builder.only.includes(l.id)));
  const canMove = builder.canMove ?? (() => true);
  const canResize = builder.canResize ?? (() => true);
  const selectedLayer = editable.find((l) => l.id === builder.selectedLayerId);

  useEffect(() => {
    const tr = transformer.current;
    if (!tr) return;
    const node = builder.selectedLayerId ? nodes.current.get(builder.selectedLayerId) : undefined;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [builder.selectedLayerId, schema]);

  function snapTargets(exceptId: string) {
    const vertical = [0, schema.width / 2, schema.width];
    const horizontal = [0, schema.height / 2, schema.height];
    for (const l of schema.layers) {
      if (l.type === "background") continue;
      if (l.id === exceptId || (l.rotation ?? 0) !== 0) continue;
      vertical.push(l.x, l.x + l.width / 2, l.x + l.width);
      horizontal.push(l.y, l.y + l.height / 2, l.y + l.height);
    }
    return { vertical, horizontal };
  }

  function onDragMove(layer: SchemaLayer, node: Konva.Rect) {
    if ((layer.rotation ?? 0) !== 0) return;
    const threshold = SNAP_PX / scale;
    const targets = snapTargets(layer.id);
    const w = node.width();
    const h = node.height();
    const snap = (center: number, size: number, lines: number[]) => {
      let best: { value: number; line: number; d: number } | null = null;
      for (const offset of [-size / 2, 0, size / 2]) {
        for (const line of lines) {
          const d = Math.abs(center + offset - line);
          if (d <= threshold && (!best || d < best.d)) best = { value: line - offset, line, d };
        }
      }
      return best;
    };
    const sx = snap(node.x(), w, targets.vertical);
    const sy = snap(node.y(), h, targets.horizontal);
    if (sx) node.x(sx.value);
    if (sy) node.y(sy.value);
    setGuides({ vertical: sx ? [sx.line] : [], horizontal: sy ? [sy.line] : [] });
  }

  function commit(layer: SchemaLayer, node: Konva.Rect) {
    const width = Math.max(1, node.width() * node.scaleX());
    const height = Math.max(1, node.height() * node.scaleY());
    node.scaleX(1);
    node.scaleY(1);
    setGuides({ vertical: [], horizontal: [] });
    const round = (v: number) => Math.round(v * 10) / 10;
    builder.onChangeLayer(layer.id, {
      x: round(node.x() - width / 2),
      y: round(node.y() - height / 2),
      width: round(width),
      height: round(height),
      rotation: round(node.rotation()),
    });
  }

  return (
    <Layer>
      {/* Klik naast alle lagen: niets geselecteerd. */}
      <Rect x={0} y={0} width={schema.width} height={schema.height} onMouseDown={() => builder.onSelectLayer(null)} onTap={() => builder.onSelectLayer(null)} />
      {editable.map((layer) => {
        const selected = layer.id === builder.selectedLayerId;
        return (
          <Rect
            key={layer.id}
            ref={(node) => {
              if (node) nodes.current.set(layer.id, node);
              else nodes.current.delete(layer.id);
            }}
            x={layer.x + layer.width / 2}
            y={layer.y + layer.height / 2}
            offsetX={layer.width / 2}
            offsetY={layer.height / 2}
            width={layer.width}
            height={layer.height}
            rotation={layer.rotation ?? 0}
            fill="rgba(0,0,0,0.001)"
            stroke={selected ? undefined : "rgba(255,111,0,0.35)"}
            strokeWidth={1}
            strokeScaleEnabled={false}
            draggable={canMove(layer)}
            onMouseDown={() => builder.onSelectLayer(layer.id)}
            onDragStart={() => builder.onSelectLayer(layer.id)}
            onTap={() => builder.onSelectLayer(layer.id)}
            onMouseEnter={(e) => {
              const c = e.target.getStage()?.container();
              if (c) c.style.cursor = selected && canMove(layer) ? "move" : "pointer";
            }}
            onMouseLeave={(e) => {
              const c = e.target.getStage()?.container();
              if (c) c.style.cursor = "default";
            }}
            onDragMove={(e) => onDragMove(layer, e.target as Konva.Rect)}
            onDragEnd={(e) => commit(layer, e.target as Konva.Rect)}
            onTransformEnd={(e) => commit(layer, e.target as Konva.Rect)}
          />
        );
      })}
      {guides.vertical.map((x) => (
        <Line key={`v${x}`} points={[x, 0, x, schema.height]} stroke="#00B8D9" strokeWidth={1} strokeScaleEnabled={false} dash={[6, 4]} listening={false} />
      ))}
      {guides.horizontal.map((y) => (
        <Line key={`h${y}`} points={[0, y, schema.width, y]} stroke="#00B8D9" strokeWidth={1} strokeScaleEnabled={false} dash={[6, 4]} listening={false} />
      ))}
      <Transformer
        ref={transformer}
        keepRatio={false}
        resizeEnabled={selectedLayer ? canResize(selectedLayer) : true}
        rotateEnabled={builder.rotate ?? true}
        rotationSnaps={[0, 90, 180, 270]}
        borderStroke="#FF6F00"
        anchorStroke="#FF6F00"
        anchorSize={10}
        ignoreStroke
        flipEnabled={false}
        boundBoxFunc={(oldBox, newBox) => (newBox.width < 4 || newBox.height < 4 ? oldBox : newBox)}
      />
    </Layer>
  );
}
