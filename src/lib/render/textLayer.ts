import type { TextLayer } from "@/lib/validations/template";
import type { FontFaceInfo } from "@/lib/fonts/faces";
import { layoutFace } from "@/lib/fonts/faces";
import { applyTextTransform } from "./textTransform";
import { layoutText, type MeasureText, type TextLayout, type TextPaint } from "./textLayout";

/**
 * De tekst die een tekstlaag toont. Zelfde regel in preview en export:
 * niet ingevuld (undefined) toont de voorbeeldtekst, bewust leeggemaakt
 * ("") toont niets. Daarna de veldtransformatie en de PSD-hoofdletters.
 */
export function resolveLayerText(layer: TextLayer, formData: Record<string, unknown>, transform?: string): string {
  const value = formData[layer.field];
  const base = typeof value === "string" ? value : layer.text ?? "";
  const transformed = applyTextTransform(base.trim(), transform);
  return layer.uppercase ? transformed.toLocaleUpperCase("nl-NL") : transformed;
}

export function layoutTextLayer(layer: TextLayer, text: string, face: FontFaceInfo, measure: MeasureText): TextLayout {
  return layoutText(
    {
      text,
      width: layer.width,
      height: layer.height,
      face: layoutFace(face),
      fontSize: layer.fontSize,
      minFontSize: layer.minFontSize,
      maxLines: layer.maxLines,
      lineHeight: layer.lineHeight,
      letterSpacing: layer.letterSpacing,
      align: layer.align,
      verticalAlign: layer.verticalAlign ?? "middle",
      allowTruncate: layer.allowTruncate,
    },
    measure
  );
}

export function textPaint(layer: TextLayer): TextPaint {
  return { color: layer.color, stroke: layer.stroke ?? null, shadow: layer.shadow ?? null };
}
