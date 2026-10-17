"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Ellipse, Group, Shape } from "react-konva";
import type Konva from "konva";
import type { Layer as SchemaLayer, TemplateSchemaJson, TextLayer } from "@/lib/validations/template";
import { BUILTIN_FONT_FACES, resolveFontFace, type FontFaceInfo, type FontResolution } from "@/lib/fonts/faces";
import { drawTextLayout, type MeasureText, type TextCanvas, type TextLayout } from "@/lib/render/textLayout";
import { layoutTextLayer, resolveLayerText, textPaint } from "@/lib/render/textLayer";
import { computeImageDraw, type ImageFieldValue } from "@/lib/render/imageFit";
import { cn } from "@/lib/utils";
import { useImage } from "./use-image";
import { useFontFaces } from "./use-font-faces";

export type DesignFormData = Record<string, unknown>;

export interface DesignCanvasProps {
  schema: TemplateSchemaJson;
  formData: DesignFormData;
  /** Maximale weergavebreedte in CSS-pixels; de preview schaalt hierop. */
  maxWidth?: number;
  maxHeight?: number;
  /** Sleep-interactie voor afbeeldingen toestaan (pan binnen kader). */
  editable?: boolean;
  onImageTransform?: (fieldKey: string, value: ImageFieldValue) => void;
  /** Teksttransformatie per veld (veldinstelling uit de builder). */
  textTransforms?: Record<string, string>;
  /** Beschikbare fontbestanden (zie listFontFaces); standaard alleen Inter. */
  fontFaces?: FontFaceInfo[];
  /** Meldingen over tekst die niet past of een ontbrekend lettertype. */
  onTextIssues?: (issues: TextIssue[]) => void;
  /** Klik/tik op een invulbare laag kiest het bijbehorende veld. */
  onSelectField?: (fieldKey: string) => void;
  /** Veld waarvan de laag gemarkeerd wordt. */
  selectedField?: string | null;
  className?: string;
}

export interface TextIssue {
  layerId: string;
  field: string;
  kind: "overflow" | "truncated" | "font-missing" | "font-substitute" | "font-failed";
  message: string;
}

let measureCtx: CanvasRenderingContext2D | null = null;
const measureBrowser: MeasureText = (text, font) => {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  const c = measureCtx!;
  c.font = font;
  if ("letterSpacing" in c) c.letterSpacing = "0px";
  return c.measureText(text).width;
};

interface TextRender {
  layout: TextLayout;
  resolution: FontResolution;
}

/**
 * Live preview-canvas. Tekent de genormaliseerde template-definitie met
 * actuele forminvoer, met hetzelfde text-fit- en crop-algoritme als de
 * server-side export (src/lib/render/serverRender.ts) zodat wat de
 * gebruiker ziet exact is wat er wordt gedownload.
 */
export function DesignCanvas({
  schema,
  formData,
  maxWidth = 480,
  maxHeight,
  editable = true,
  onImageTransform,
  textTransforms,
  fontFaces = BUILTIN_FONT_FACES,
  onTextIssues,
  onSelectField,
  selectedField,
  className,
}: DesignCanvasProps) {
  const textLayers = useMemo(
    () => schema.layers.filter((l): l is TextLayer => l.type === "text"),
    [schema.layers]
  );
  const resolutions = useMemo(
    () => new Map(textLayers.map((l) => [l.id, resolveFontFace(l, fontFaces)])),
    [textLayers, fontFaces]
  );
  const neededFaces = useMemo(() => [...resolutions.values()].map((r) => r.face), [resolutions]);
  const fonts = useFontFaces(neededFaces);

  // Eén layout per tekstlaag, pas berekend als de fontbestanden geladen zijn.
  const textRenders = useMemo(() => {
    const map = new Map<string, TextRender>();
    if (!fonts.ready) return map;
    for (const layer of textLayers) {
      const resolution = resolutions.get(layer.id)!;
      const text = resolveLayerText(layer, formData, textTransforms?.[layer.field]);
      map.set(layer.id, { resolution, layout: layoutTextLayer(layer, text, resolution.face, measureBrowser) });
    }
    return map;
  }, [fonts.ready, textLayers, resolutions, formData, textTransforms]);

  const issues = useMemo(() => {
    const list: TextIssue[] = [];
    for (const layer of textLayers) {
      const render = textRenders.get(layer.id);
      const name = layer.name ?? layer.field;
      if (!render) continue;
      const { resolution, layout } = render;
      if (fonts.failed.includes(`${resolution.face.family} ${resolution.face.subfamily}`)) {
        list.push({ layerId: layer.id, field: layer.field, kind: "font-failed", message: `Het lettertype van "${name}" kon niet worden geladen.` });
      } else if (resolution.status === "missing" || resolution.status === "substitute") {
        list.push({
          layerId: layer.id,
          field: layer.field,
          kind: resolution.status === "missing" ? "font-missing" : "font-substitute",
          message: resolution.message ?? "",
        });
      }
      if (layout.overflow) {
        list.push({ layerId: layer.id, field: layer.field, kind: "overflow", message: `De tekst in "${name}" past niet; maak hem korter.` });
      } else if (layout.truncated) {
        list.push({ layerId: layer.id, field: layer.field, kind: "truncated", message: `De tekst in "${name}" wordt afgekort.` });
      }
    }
    return list;
  }, [textLayers, textRenders, fonts.failed]);

  const issuesKey = JSON.stringify(issues);
  const issuesCallback = useRef(onTextIssues);
  useEffect(() => {
    issuesCallback.current = onTextIssues;
  });
  useEffect(() => {
    if (fonts.ready) issuesCallback.current?.(JSON.parse(issuesKey) as TextIssue[]);
  }, [issuesKey, fonts.ready]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(maxWidth);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const widthScale = Math.min(1, containerWidth / schema.width);
  const heightScale = maxHeight ? Math.min(1, maxHeight / schema.height) : widthScale;
  const scale = Math.min(widthScale, heightScale);

  const stageWidth = schema.width * scale;
  const stageHeight = schema.height * scale;

  return (
    // w-full zorgt dat deze div zich naar de werkelijk beschikbare breedte
    // van de ouder voegt in plaats van naar de breedte van de canvas zelf —
    // zonder dat zou de ResizeObserver hieronder nooit een kleinere breedte
    // meten dan maxWidth (de canvas ZOU immers al zo breed zijn als maxWidth
    // op het eerste render), waardoor de preview op smalle schermen buiten
    // de viewport uitsteekt in plaats van mee te krimpen.
    <div ref={containerRef} className={cn("w-full", className)} style={{ maxWidth }}>
      <Stage width={stageWidth} height={stageHeight} scaleX={scale} scaleY={scale}>
        <Layer listening={editable}>
          {schema.layers.map((layer) => (
            <LayerNode
              key={layer.id}
              layer={layer}
              formData={formData}
              editable={editable}
              onImageTransform={onImageTransform}
              textRender={textRenders.get(layer.id)}
              onSelectField={editable ? onSelectField : undefined}
              selected={Boolean(selectedField) && fieldOf(layer) === selectedField}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}

/** Het invulveld dat bij een laag hoort (vaste lagen hebben er geen). */
function fieldOf(layer: SchemaLayer): string | undefined {
  if (layer.type === "text" || layer.type === "image" || layer.type === "color") return layer.field;
  if (layer.type === "background") return layer.field;
  return undefined;
}

function setCursor(e: Konva.KonvaEventObject<Event>, cursor: string) {
  const container = e.target.getStage()?.container();
  if (container) container.style.cursor = cursor;
}

function LayerNode({
  layer,
  formData,
  editable,
  onImageTransform,
  textRender,
  onSelectField,
  selected,
}: {
  layer: SchemaLayer;
  formData: DesignFormData;
  editable: boolean;
  onImageTransform?: (fieldKey: string, value: ImageFieldValue) => void;
  textRender?: TextRender;
  onSelectField?: (fieldKey: string) => void;
  selected: boolean;
}) {
  if (layer.visibilityField) {
    const value = formData[layer.visibilityField];
    if (value === false || value === "false") return null;
  }

  const field = fieldOf(layer);
  const select = field && onSelectField ? () => onSelectField(field) : undefined;
  let content = layerContent(layer, formData, editable, onImageTransform, textRender, select);
  if (select && layer.type !== "image" && layer.type !== "background") {
    // Onzichtbaar klikvlak over het hele kader, ook als de tekst kort is.
    content = (
      <>
        {content}
        <Rect
          x={layer.x}
          y={layer.y}
          width={layer.width}
          height={layer.height}
          onClick={select}
          onTap={select}
          onMouseEnter={(e) => setCursor(e, "pointer")}
          onMouseLeave={(e) => setCursor(e, "default")}
        />
      </>
    );
  }
  if (selected) {
    content = (
      <>
        {content}
        <Rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} stroke="#FF6F00" strokeWidth={4} strokeScaleEnabled={false} dash={[10, 6]} listening={false} />
      </>
    );
  }
  if (!content) return null;
  const rotation = layer.rotation ?? 0;
  const opacity = layer.opacity ?? 1;
  if (!rotation && opacity >= 1) return content;
  // Rotatie rond het midden van het kader en dekking: gelijk aan de export.
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  return (
    <Group x={cx} y={cy} offsetX={cx} offsetY={cy} rotation={rotation} opacity={opacity}>
      {content}
    </Group>
  );
}

function layerContent(
  layer: SchemaLayer,
  formData: DesignFormData,
  editable: boolean,
  onImageTransform: ((fieldKey: string, value: ImageFieldValue) => void) | undefined,
  textRender: TextRender | undefined,
  onSelect: (() => void) | undefined
) {
  switch (layer.type) {
    case "background":
      return layer.field ? (
        <CroppableImageLayer
          x={layer.x}
          y={layer.y}
          width={layer.width}
          height={layer.height}
          fit={layer.fit ?? "cover"}
          shape="rect"
          cornerRadius={0}
          field={layer.field}
          placeholderSrc={layer.src || undefined}
          formData={formData}
          editable={editable}
          onImageTransform={onImageTransform}
          onSelect={onSelect}
        />
      ) : (
        <RasterLayer layer={layer} />
      );
    case "static_image":
      return <RasterLayer layer={layer} />;
    case "text":
      return textRender ? <TextLayerNode layer={layer} render={textRender} /> : null;
    case "color":
      return <ColorLayerNode layer={layer} formData={formData} />;
    case "image":
      return (
        <CroppableImageLayer
          x={layer.x}
          y={layer.y}
          width={layer.width}
          height={layer.height}
          fit={layer.fit}
          shape={layer.shape}
          cornerRadius={layer.cornerRadius}
          field={layer.field}
          placeholderSrc={layer.placeholderSrc}
          formData={formData}
          editable={editable}
          onImageTransform={onImageTransform}
          onSelect={onSelect}
        />
      );
    default:
      return null;
  }
}

function RasterLayer({ layer }: { layer: Extract<SchemaLayer, { type: "background" | "static_image" }> }) {
  const img = useImage(layer.src || undefined);
  if (!img) return null;
  return <KonvaImage image={img} x={layer.x} y={layer.y} width={layer.width} height={layer.height} listening={false} />;
}

function TextLayerNode({ layer, render }: { layer: TextLayer; render: TextRender }) {
  const { layout } = render;
  if (layout.lines.length === 0) return null;
  const paint = textPaint(layer);
  return (
    <Shape
      x={layer.x}
      y={layer.y}
      listening={false}
      sceneFunc={(ctx) => {
        // Zelfde tekenfunctie als de server-export, op de echte 2D-context.
        drawTextLayout(ctx._context as unknown as TextCanvas, layout, paint);
      }}
    />
  );
}

function ColorLayerNode({ layer, formData }: { layer: Extract<SchemaLayer, { type: "color" }>; formData: DesignFormData }) {
  const color = (formData[layer.field] as string) || layer.defaultColor;
  if (layer.shape === "circle") {
    return (
      <Ellipse
        x={layer.x + layer.width / 2}
        y={layer.y + layer.height / 2}
        radiusX={layer.width / 2}
        radiusY={layer.height / 2}
        fill={color}
        listening={false}
      />
    );
  }
  return (
    <Rect
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      cornerRadius={layer.cornerRadius}
      fill={color}
      listening={false}
    />
  );
}

/**
 * Tekent een door de gebruiker vervangbare afbeelding (crop/pan/zoom) met
 * fallback naar een placeholder. Gedeeld door IMAGE:*-velden en een
 * achtergrondlaag die door de admin vervangbaar is gemaakt (zie
 * BackgroundLayer.field in de template-builder) — beide gebruiken exact
 * hetzelfde crop-/pan-gedrag zodat wat de gebruiker sleept overeenkomt met
 * de server-side export.
 */
function CroppableImageLayer({
  x,
  y,
  width,
  height,
  fit,
  shape,
  cornerRadius,
  field,
  placeholderSrc,
  formData,
  editable,
  onImageTransform,
  onSelect,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  fit: "contain" | "cover";
  shape: "rect" | "circle";
  cornerRadius: number;
  field: string;
  placeholderSrc?: string;
  formData: DesignFormData;
  editable: boolean;
  onImageTransform?: (fieldKey: string, value: ImageFieldValue) => void;
  onSelect?: () => void;
}) {
  const value = (formData[field] ?? {}) as ImageFieldValue;
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const src = value.assetUrl || placeholderSrc;
  const img = useImage(src);
  const imgRef = useRef<Konva.Image>(null);

  if (!img) {
    // Zonder (geladen) afbeelding tekent de export niets; de preview ook
    // niet, op een stippellijn na zodat de invuller het kader kan vinden.
    if (!editable || !onImageTransform) return null;
    return (
      <Rect
        x={x + 0.5}
        y={y + 0.5}
        width={width - 1}
        height={height - 1}
        cornerRadius={shape === "circle" ? width / 2 : cornerRadius}
        stroke="rgba(255,255,255,0.6)"
        strokeWidth={2}
        dash={[8, 6]}
        listening={Boolean(onSelect)}
        hitStrokeWidth={0}
        fillEnabled={false}
        onClick={onSelect}
        onTap={onSelect}
      />
    );
  }

  const draw = computeImageDraw(
    { width, height },
    { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height },
    fit,
    value
  );

  const clipFunc =
    shape === "circle"
      ? (ctx: Konva.Context) => {
          ctx.beginPath();
          ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
          ctx.closePath();
        }
      : undefined;

  const interactive = editable && Boolean(onImageTransform);

  return (
    <Group x={x} y={y} clipFunc={clipFunc} clipWidth={clipFunc ? undefined : width} clipHeight={clipFunc ? undefined : height} clipX={clipFunc ? undefined : 0} clipY={clipFunc ? undefined : 0}>
      <KonvaImage
        ref={imgRef}
        image={img}
        x={draw.drawX}
        y={draw.drawY}
        width={draw.drawWidth}
        height={draw.drawHeight}
        draggable={interactive}
        onMouseEnter={(e) => interactive && setCursor(e, "grab")}
        onMouseLeave={(e) => interactive && setCursor(e, "default")}
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={(e) => {
          setCursor(e, "grabbing");
          onSelect?.();
        }}
        onTouchMove={(e) => {
          // Knijpen met twee vingers zoomt, net als de schuifregelaar.
          const touches = e.evt.touches;
          if (!interactive || !onImageTransform || touches.length !== 2) return;
          e.evt.preventDefault();
          const distance = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
          if (!pinch.current) {
            imgRef.current?.stopDrag();
            pinch.current = { distance, scale: value.scale ?? 1 };
            return;
          }
          const next = Math.min(2.5, Math.max(1, (pinch.current.scale * distance) / pinch.current.distance));
          onImageTransform(field, { ...value, scale: next });
        }}
        onTouchEnd={() => {
          pinch.current = null;
        }}
        onDragEnd={(e) => {
          if (interactive) setCursor(e, "grab");
          const node = imgRef.current;
          if (!node || !onImageTransform) return;
          const newDrawX = node.x();
          const newDrawY = node.y();
          const panX = newDrawX - (width - draw.drawWidth) / 2;
          const panY = newDrawY - (height - draw.drawHeight) / 2;
          onImageTransform(field, { ...value, panX, panY });
        }}
        onWheel={(e) => {
          if (!interactive || !onImageTransform) return;
          e.evt.preventDefault();
          const current = value.scale ?? 1;
          const next = Math.min(2.5, Math.max(1, current - e.evt.deltaY * 0.0015));
          onImageTransform(field, { ...value, scale: next });
        }}
      />
      {interactive && (
        <Rect
          x={0.5}
          y={0.5}
          width={width - 1}
          height={height - 1}
          cornerRadius={shape === "circle" ? width / 2 : cornerRadius}
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={1}
          dash={[6, 4]}
          listening={false}
        />
      )}
    </Group>
  );
}
