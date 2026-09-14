import type { FontSpec, MeasureFn } from "./textFit";

let ctx: CanvasRenderingContext2D | null = null;

function getCtx(): CanvasRenderingContext2D {
  if (!ctx) {
    const canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
  }
  return ctx!;
}

function cssFont(font: FontSpec): string {
  return `${font.style} ${font.weight} ${font.size}px "${font.family}", ui-sans-serif, system-ui, sans-serif`;
}

/** Browser-implementatie van MeasureFn, gebruikt door de live preview (Konva). */
export const measureBrowser: MeasureFn = (text, font) => {
  const c = getCtx();
  c.font = cssFont(font);
  const metrics = c.measureText(text);
  const spacing = font.letterSpacing * Math.max(0, text.length - 1);
  return metrics.width + spacing;
};
