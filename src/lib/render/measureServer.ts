import { createCanvas } from "@napi-rs/canvas";
import type { FontSpec, MeasureFn } from "./textFit";

const measureCanvas = createCanvas(16, 16);
const measureCtx = measureCanvas.getContext("2d");

export function cssFont(font: FontSpec): string {
  return `${font.style} ${font.weight} ${font.size}px "${font.family}"`;
}

export const measureServer: MeasureFn = (text, font) => {
  measureCtx.font = cssFont(font);
  const metrics = measureCtx.measureText(text);
  const spacing = font.letterSpacing * Math.max(0, text.length - 1);
  return metrics.width + spacing;
};
