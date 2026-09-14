/**
 * Smart text fitting (zie MASTERPROMPT sectie 7).
 *
 * Omgevingsonafhankelijk: zowel de browser-preview (Konva) als de
 * server-side hoge-resolutie export gebruiken exact dit algoritme, elk met
 * hun eigen `measure`-implementatie (Canvas 2D in de browser,
 * @napi-rs/canvas op de server) zodat preview en export altijd hetzelfde
 * resultaat opleveren.
 *
 * Prioriteit, zoals gespecificeerd:
 *   1. originele fontgrootte
 *   2. stapsgewijs verkleinen tot het past
 *   3. minimum fontgrootte respecteren
 *   4. eventueel meerdere regels (tot maxLines)
 *   5. nooit afkappen, tenzij expliciet toegestaan voor dat veld
 */

export type MeasureFn = (text: string, font: FontSpec) => number;

export interface FontSpec {
  family: string;
  size: number;
  weight: number;
  style: "normal" | "italic";
  letterSpacing: number;
}

export interface FitTextParams {
  text: string;
  maxWidth: number;
  maxHeight: number;
  fontFamily: string;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  startSize: number;
  minSize: number;
  maxLines: number;
  lineHeight: number;
  letterSpacing: number;
  uppercase: boolean;
  allowTruncate: boolean;
  measure: MeasureFn;
}

export interface FitTextResult {
  fontSize: number;
  lines: string[];
  /** True wanneer de tekst ook op minimale grootte niet volledig past. */
  overflow: boolean;
}

export function fitText(params: FitTextParams): FitTextResult {
  const {
    text,
    maxWidth,
    maxHeight,
    fontFamily,
    fontWeight,
    fontStyle,
    startSize,
    minSize,
    maxLines,
    lineHeight,
    letterSpacing,
    uppercase,
    allowTruncate,
    measure,
  } = params;

  const content = (uppercase ? text.toUpperCase() : text).trim();
  if (!content) {
    return { fontSize: startSize, lines: [], overflow: false };
  }

  const safeMin = Math.min(minSize, startSize);
  let best: FitTextResult | null = null;

  for (let size = startSize; size >= safeMin; size--) {
    const font: FontSpec = { family: fontFamily, size, weight: fontWeight, style: fontStyle, letterSpacing };
    const lines = wrapText(content, maxWidth, font, measure, maxLines);
    const totalHeight = lines.length * size * lineHeight;
    const fits =
      lines.length <= maxLines &&
      totalHeight <= maxHeight &&
      lines.every((line) => measure(line, font) <= maxWidth);

    if (fits) {
      best = { fontSize: size, lines, overflow: false };
      break;
    }
    // Bewaar het beste (kleinste) resultaat als fallback voor als niets past.
    best = { fontSize: size, lines, overflow: true };
  }

  if (!best) {
    return { fontSize: safeMin, lines: [content], overflow: true };
  }

  if (best.overflow && allowTruncate) {
    const font: FontSpec = {
      family: fontFamily,
      size: best.fontSize,
      weight: fontWeight,
      style: fontStyle,
      letterSpacing,
    };
    best.lines = truncateLines(best.lines, maxLines, maxWidth, font, measure);
  }

  return best;
}

function wrapText(
  text: string,
  maxWidth: number,
  font: FontSpec,
  measure: MeasureFn,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, font) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  else if (current && lines.length >= maxLines) {
    // laatste regel bevat de rest, wordt evt. later afgekapt
    lines[lines.length - 1] = `${lines[lines.length - 1]} ${current}`.trim();
  }

  return lines;
}

function truncateLines(
  lines: string[],
  maxLines: number,
  maxWidth: number,
  font: FontSpec,
  measure: MeasureFn
): string[] {
  const limited = lines.slice(0, maxLines);
  const lastIndex = limited.length - 1;
  if (lastIndex < 0) return limited;

  let last = limited[lastIndex];
  while (measure(`${last}…`, font) > maxWidth && last.length > 1) {
    last = last.slice(0, -1).trimEnd();
  }
  limited[lastIndex] = `${last}…`;
  return limited;
}
