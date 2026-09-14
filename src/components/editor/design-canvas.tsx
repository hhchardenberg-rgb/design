"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Stage, Layer, Image as KonvaImage, Text as KonvaText, Rect, Ellipse, Group } from "react-konva";
import type Konva from "konva";
import type { Layer as SchemaLayer, TemplateSchemaJson } from "@/lib/validations/template";
import { fitText } from "@/lib/render/textFit";
import { measureBrowser } from "@/lib/render/measureBrowser";
import { computeImageDraw, type ImageFieldValue } from "@/lib/render/imageFit";
import { useImage } from "./use-image";

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
  className?: string;
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
  className,
}: DesignCanvasProps) {
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
    <div ref={containerRef} className={className}>
      <Stage width={stageWidth} height={stageHeight} scaleX={scale} scaleY={scale}>
        <Layer listening={editable}>
          {schema.layers.map((layer) => (
            <LayerNode
              key={layer.id}
              layer={layer}
              formData={formData}
              editable={editable}
              onImageTransform={onImageTransform}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}

function LayerNode({
  layer,
  formData,
  editable,
  onImageTransform,
}: {
  layer: SchemaLayer;
  formData: DesignFormData;
  editable: boolean;
  onImageTransform?: (fieldKey: string, value: ImageFieldValue) => void;
}) {
  if (layer.visibilityField) {
    const value = formData[layer.visibilityField];
    if (value === false || value === "false") return null;
  }

  switch (layer.type) {
    case "background":
    case "static_image":
      return <RasterLayer layer={layer} />;
    case "text":
      return <TextLayerNode layer={layer} formData={formData} />;
    case "color":
      return <ColorLayerNode layer={layer} formData={formData} />;
    case "image":
      return (
        <ImageLayerNode
          layer={layer}
          formData={formData}
          editable={editable}
          onImageTransform={onImageTransform}
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

function TextLayerNode({ layer, formData }: { layer: Extract<SchemaLayer, { type: "text" }>; formData: DesignFormData }) {
  const raw = ((formData[layer.field] as string) ?? layer.text ?? "").trim();

  const fit = useMemo(
    () =>
      fitText({
        text: raw,
        maxWidth: layer.width,
        maxHeight: layer.height,
        fontFamily: layer.fontFamily,
        fontWeight: layer.fontWeight,
        fontStyle: layer.fontStyle,
        startSize: layer.fontSize,
        minSize: layer.minFontSize,
        maxLines: layer.maxLines,
        lineHeight: layer.lineHeight,
        letterSpacing: layer.letterSpacing,
        uppercase: layer.uppercase,
        allowTruncate: layer.allowTruncate,
        measure: measureBrowser,
      }),
    [raw, layer]
  );

  if (!raw) return null;

  const totalHeight = fit.lines.length * fit.fontSize * layer.lineHeight;
  const y = layer.y + Math.max(0, (layer.height - totalHeight) / 2);

  return (
    <KonvaText
      text={fit.lines.join("\n")}
      x={layer.x}
      y={y}
      width={layer.width}
      align={layer.align}
      fontFamily={layer.fontFamily}
      fontSize={fit.fontSize}
      fontStyle={`${layer.fontStyle === "italic" ? "italic " : ""}${layer.fontWeight >= 700 ? "bold" : "normal"}`.trim()}
      letterSpacing={layer.letterSpacing}
      lineHeight={layer.lineHeight}
      fill={layer.color}
      listening={false}
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

function ImageLayerNode({
  layer,
  formData,
  editable,
  onImageTransform,
}: {
  layer: Extract<SchemaLayer, { type: "image" }>;
  formData: DesignFormData;
  editable: boolean;
  onImageTransform?: (fieldKey: string, value: ImageFieldValue) => void;
}) {
  const value = (formData[layer.field] ?? {}) as ImageFieldValue;
  const src = value.assetUrl || layer.placeholderSrc;
  const img = useImage(src);
  const imgRef = useRef<Konva.Image>(null);

  if (!img) {
    return (
      <Rect
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        cornerRadius={layer.shape === "circle" ? layer.width / 2 : layer.cornerRadius}
        fill="#e4e1db"
        listening={false}
      />
    );
  }

  const draw = computeImageDraw(
    { width: layer.width, height: layer.height },
    { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height },
    layer.fit,
    value
  );

  const clipFunc =
    layer.shape === "circle"
      ? (ctx: Konva.Context) => {
          ctx.beginPath();
          ctx.ellipse(layer.width / 2, layer.height / 2, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
          ctx.closePath();
        }
      : undefined;

  return (
    <Group x={layer.x} y={layer.y} clipFunc={clipFunc} clipWidth={clipFunc ? undefined : layer.width} clipHeight={clipFunc ? undefined : layer.height} clipX={clipFunc ? undefined : 0} clipY={clipFunc ? undefined : 0}>
      <KonvaImage
        ref={imgRef}
        image={img}
        x={draw.drawX}
        y={draw.drawY}
        width={draw.drawWidth}
        height={draw.drawHeight}
        draggable={editable && Boolean(onImageTransform)}
        onDragEnd={() => {
          const node = imgRef.current;
          if (!node || !onImageTransform) return;
          const newDrawX = node.x();
          const newDrawY = node.y();
          const panX = newDrawX - (layer.width - draw.drawWidth) / 2;
          const panY = newDrawY - (layer.height - draw.drawHeight) / 2;
          onImageTransform(layer.field, { ...value, panX, panY });
        }}
      />
    </Group>
  );
}
