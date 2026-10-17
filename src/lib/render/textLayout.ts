/**
 * Tekstlayoutcontract, gedeeld door de interactieve preview (browser) en de
 * definitieve export (server).
 *
 * `layoutText` bepaalt één keer de lettergrootte, de regels, de x-positie en
 * de baseline van elke regel, in lokale coördinaten van het tekstkader.
 * `drawTextLayout` tekent precies die regels; geen van beide renderers breekt
 * de tekst zelf opnieuw af. De baseline volgt uit de metrics van het
 * fontbestand (ascender/descender per em), niet uit een vaste factor.
 *
 * Regels:
 *  - grootte stapsgewijs (1 px) van `fontSize` naar `minFontSize`;
 *  - handmatige regeleinden blijven regeleinden, daarbinnen wordt op woorden
 *    afgebroken; een woord dat niet past wordt niet midden in gebroken;
 *  - past de tekst ook op de minimale grootte niet, dan `overflow: true`;
 *    alleen bij `allowTruncate` worden regels afgekapt met een beletselteken;
 *  - regelhoogte: `fontSize * lineHeight`; de inhoud (ascender + descender)
 *    staat verticaal gecentreerd in elke regel (zoals CSS);
 *  - het tekstblok staat boven, midden of onder in het kader;
 *  - letterafstand: `letterSpacing` px tussen tekens (niet na het laatste).
 */

export interface LayoutFace {
  /** Unieke familienaam waaronder precies dit fontbestand geregistreerd is. */
  alias: string;
  weight: number;
  style: "normal" | "italic";
  /** Ascender en descender als fractie van de em (beide positief). */
  ascent: number;
  descent: number;
}

export interface TextLayoutInput {
  text: string;
  width: number;
  height: number;
  face: LayoutFace;
  fontSize: number;
  minFontSize: number;
  maxLines: number;
  lineHeight: number;
  letterSpacing: number;
  align: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  allowTruncate: boolean;
  /**
   * Eerste basislijn uit Photoshop (zie TextLayer.psdBaseline). Bij dezelfde
   * grootte en hetzelfde aantal regels valt de tekst daar exact; bij andere
   * tekst schuift alles evenveel mee (geschaald met de lettergrootte).
   */
  anchor?: { y: number; lines: number; fontSize: number };
}

export interface TextLayoutLine {
  text: string;
  x: number;
  baseline: number;
  width: number;
}

export interface TextLayout {
  fontSize: number;
  font: string;
  letterSpacing: number;
  lineHeightPx: number;
  lines: TextLayoutLine[];
  /** De tekst past niet binnen kader en regels, ook niet op minimale grootte. */
  overflow: boolean;
  /** Er is tekst weggelaten (alleen mogelijk met allowTruncate). */
  truncated: boolean;
}

/** Meet de natuurlijke breedte van tekst (zonder letterafstand) in een CSS-font. */
export type MeasureText = (text: string, font: string) => number;

export function fontString(face: LayoutFace, size: number): string {
  return `${face.style} ${face.weight} ${size}px "${face.alias}"`;
}

const ELLIPSIS = "…";
const EPSILON = 0.01;

function graphemeCount(text: string): number {
  return [...text].length;
}

function lineWidth(text: string, font: string, spacing: number, measure: MeasureText): number {
  if (!text) return 0;
  return measure(text, font) + spacing * Math.max(0, graphemeCount(text) - 1);
}

function wrapParagraph(paragraph: string, maxWidth: number, font: string, spacing: number, measure: MeasureText): string[] {
  const words = paragraph.split(/[ \t]+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || lineWidth(candidate, font, spacing, measure) <= maxWidth + EPSILON) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function wrapAll(text: string, maxWidth: number, font: string, spacing: number, measure: MeasureText): string[] {
  return text.split("\n").flatMap((p) => wrapParagraph(p.trim(), maxWidth, font, spacing, measure));
}

export function layoutText(input: TextLayoutInput, measure: MeasureText): TextLayout {
  const text = input.text.replace(/\r\n?/g, "\n").trim();
  const start = Math.max(1, input.fontSize);
  const min = Math.max(1, Math.min(input.minFontSize, start));
  const maxLines = Math.max(1, Math.floor(input.maxLines));

  if (!text) return position(input, start, [], false, false, measure);

  let size = start;
  let lines: string[] = [];
  let fits = false;
  for (size = start; size >= min; size--) {
    const font = fontString(input.face, size);
    lines = wrapAll(text, input.width, font, input.letterSpacing, measure);
    const lineHeightPx = size * input.lineHeight;
    fits =
      lines.length <= maxLines &&
      lines.length * lineHeightPx <= input.height + EPSILON &&
      lines.every((l) => lineWidth(l, font, input.letterSpacing, measure) <= input.width + EPSILON);
    if (fits) break;
  }
  if (!fits) size = min;

  if (fits) return position(input, size, lines, false, false, measure);

  const font = fontString(input.face, size);
  lines = wrapAll(text, input.width, font, input.letterSpacing, measure);
  if (!input.allowTruncate) return position(input, size, lines, true, false, measure);

  // Afkappen: zoveel regels als in het kader passen, laatste regel met "…".
  const lineHeightPx = size * input.lineHeight;
  const room = Math.max(1, Math.min(maxLines, Math.floor((input.height + EPSILON) / lineHeightPx)));
  const kept = lines.slice(0, room).map((l) => fitWithEllipsis(l, input.width, font, input.letterSpacing, measure, false));
  if (lines.length > room) {
    kept[room - 1] = fitWithEllipsis(kept[room - 1], input.width, font, input.letterSpacing, measure, true);
  }
  return position(input, size, kept, false, true, measure);
}

function fitWithEllipsis(line: string, maxWidth: number, font: string, spacing: number, measure: MeasureText, force: boolean): string {
  if (!force && lineWidth(line, font, spacing, measure) <= maxWidth + EPSILON) return line;
  const chars = [...line];
  while (chars.length > 0) {
    const candidate = `${chars.join("").trimEnd()}${ELLIPSIS}`;
    if (lineWidth(candidate, font, spacing, measure) <= maxWidth + EPSILON) return candidate;
    chars.pop();
  }
  return ELLIPSIS;
}

/** Basislijn binnen één regel: inhoud (ascender + descender) gecentreerd. */
function baselineInLine(input: TextLayoutInput, size: number): number {
  const contentHeight = (input.face.ascent + input.face.descent) * size;
  return (size * input.lineHeight - contentHeight) / 2 + input.face.ascent * size;
}

function position(
  input: TextLayoutInput,
  size: number,
  lines: string[],
  overflow: boolean,
  truncated: boolean,
  measure: MeasureText
): TextLayout {
  const font = fontString(input.face, size);
  const lineHeightPx = size * input.lineHeight;
  const blockHeight = lines.length * lineHeightPx;
  const top =
    input.verticalAlign === "top" ? 0 : input.verticalAlign === "bottom" ? input.height - blockHeight : (input.height - blockHeight) / 2;
  const baselineOffset = baselineInLine(input, size);
  let shift = 0;
  if (input.anchor) {
    const ref = input.anchor;
    const refLine = ref.fontSize * input.lineHeight;
    const refBlock = ref.lines * refLine;
    const refTop =
      input.verticalAlign === "top" ? 0 : input.verticalAlign === "bottom" ? input.height - refBlock : (input.height - refBlock) / 2;
    shift = (ref.y - (refTop + baselineInLine(input, ref.fontSize))) * (size / ref.fontSize);
  }

  return {
    fontSize: size,
    font,
    letterSpacing: input.letterSpacing,
    lineHeightPx,
    overflow,
    truncated,
    lines: lines.map((text, i) => {
      const width = lineWidth(text, font, input.letterSpacing, measure);
      const x = input.align === "center" ? (input.width - width) / 2 : input.align === "right" ? input.width - width : 0;
      return { text, x, baseline: top + i * lineHeightPx + baselineOffset + shift, width };
    }),
  };
}

// ---------------------------------------------------------------------------
// Tekenen
// ---------------------------------------------------------------------------

/** Het deel van de Canvas 2D-API dat zowel de browser als @napi-rs/canvas biedt. */
export interface TextCanvas {
  font: string;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineJoin: string;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  letterSpacing?: string;
  save(): void;
  restore(): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
}

export interface TextPaint {
  color: string;
  /** Omlijning buiten de letters, in px op documentresolutie. */
  stroke?: { color: string; width: number } | null;
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number } | null;
}

export function drawTextLayout(ctx: TextCanvas, layout: TextLayout, paint: TextPaint) {
  if (layout.lines.length === 0) return;
  ctx.save();
  ctx.font = layout.font;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const nativeSpacing = "letterSpacing" in ctx;
  if (nativeSpacing) ctx.letterSpacing = `${layout.letterSpacing}px`;

  const draw = (fn: (t: string, x: number, y: number) => void) => {
    for (const line of layout.lines) drawLine(ctx, fn, line, layout.letterSpacing, nativeSpacing);
  };

  const shadow = paint.shadow && paint.shadow.color ? paint.shadow : null;
  const setShadow = (on: boolean) => {
    ctx.shadowColor = on && shadow ? shadow.color : "rgba(0,0,0,0)";
    ctx.shadowBlur = on && shadow ? shadow.blur : 0;
    ctx.shadowOffsetX = on && shadow ? shadow.offsetX : 0;
    ctx.shadowOffsetY = on && shadow ? shadow.offsetY : 0;
  };

  if (paint.stroke && paint.stroke.width > 0) {
    // Omlijning ligt onder de vulling: lijn dubbel zo dik, vulling eroverheen.
    setShadow(true);
    ctx.strokeStyle = paint.stroke.color;
    ctx.lineWidth = paint.stroke.width * 2;
    ctx.lineJoin = "round";
    draw((t, x, y) => ctx.strokeText(t, x, y));
    setShadow(false);
  } else {
    setShadow(true);
  }
  ctx.fillStyle = paint.color;
  draw((t, x, y) => ctx.fillText(t, x, y));
  ctx.restore();
}

function drawLine(
  ctx: TextCanvas,
  fn: (t: string, x: number, y: number) => void,
  line: TextLayoutLine,
  spacing: number,
  nativeSpacing: boolean
) {
  if (spacing === 0 || nativeSpacing) {
    fn(line.text, line.x, line.baseline);
    return;
  }
  // Terugval voor engines zonder ctx.letterSpacing: teken per teken.
  let x = line.x;
  for (const ch of line.text) {
    fn(ch, x, line.baseline);
    x += ctx.measureText(ch).width + spacing;
  }
}
