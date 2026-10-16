import type { Layer, LayerTextData, TextStyle, UnitsValue } from "ag-psd";
import type { TextLayer } from "@/lib/validations/template";

/**
 * Zet een Photoshop-tekstlaag om naar een tekstlaag van het templatemodel.
 *
 *  - lettergrootte inclusief de schaal uit de laagtransformatie (vrij
 *    transformeren in Photoshop verandert de transform, niet de fontSize);
 *  - rotatie uit dezelfde transform, het kader is het niet-gedraaide kader;
 *  - alineatekst: het alineakader uit de PSD; puntentekst: de pixelgrenzen;
 *  - PostScript-naam, zodat het juiste fontbestand gevonden wordt;
 *  - hoofdletters (All Caps), regelafstand, letterafstand;
 *  - laageffecten omlijning en slagschaduw.
 * Wat niet na te bootsen is (verschillende opmaak in één laag, warp, tekst
 * op een pad, verticale tekst, overige effecten) levert een waarschuwing.
 */
export interface PsdTextBox {
  key: string;
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  visibilityField?: string;
}

export function textLayerFromPsd(box: PsdTextBox, psdLayer: Pick<Layer, "text" | "effects" | "opacity" | "name">) {
  const warnings: string[] = [];
  const data: LayerTextData | undefined = psdLayer.text;
  const style: TextStyle = data?.styleRuns?.[0]?.style ?? data?.style ?? {};
  const paragraph = data?.paragraphStyleRuns?.[0]?.style ?? data?.paragraphStyle;
  const label = `Tekstlaag "${psdLayer.name ?? box.name}"`;

  const [xx, xy, yx, yy, tx, ty] = data?.transform?.length === 6 ? data.transform : [1, 0, 0, 1, box.left, box.top];
  const scaleX = Math.hypot(xx, xy) || 1;
  const scaleY = Math.hypot(yx, yy) || 1;
  let rotation = round((Math.atan2(xy, xx) * 180) / Math.PI, 1);
  if (Math.abs(rotation) < 0.05) rotation = 0;

  const rawSize = style.fontSize ?? 32;
  const fontSize = round(rawSize * scaleY * ((style.verticalScale ?? 1) || 1), 1);
  if (style.horizontalScale && Math.abs(style.horizontalScale - 1) > 0.01) {
    warnings.push(`${label}: horizontaal schalen van letters wordt niet nagebootst.`);
  }

  // Kader: alineatekst heeft een echt kader (in tekstcoördinaten, vóór de
  // transform); bij puntentekst zijn alleen de pixelgrenzen bekend.
  let x = box.left;
  let y = box.top;
  let width = box.width;
  let height = box.height;
  const bb = data?.boxBounds;
  if (data?.shapeType === "box" && bb?.length === 4 && bb[2] > bb[0] && bb[3] > bb[1]) {
    width = (bb[2] - bb[0]) * scaleX;
    height = (bb[3] - bb[1]) * scaleY;
    const cx = (bb[0] + bb[2]) / 2;
    const cy = (bb[1] + bb[3]) / 2;
    const centerX = tx + xx * cx + yx * cy;
    const centerY = ty + xy * cx + yy * cy;
    x = centerX - width / 2;
    y = centerY - height / 2;
  } else if (rotation) {
    const unrotated = unrotateBox(box.width, box.height, rotation);
    if (unrotated) {
      x = box.left + box.width / 2 - unrotated.width / 2;
      y = box.top + box.height / 2 - unrotated.height / 2;
      width = unrotated.width;
      height = unrotated.height;
    } else {
      warnings.push(`${label}: het kader van gedraaide puntentekst is geschat; controleer het in de builder.`);
    }
  }
  if (data?.shapeType !== "box") {
    // Puntentekst heeft geen kader: wat marge zodat dezelfde tekst niet
    // door meetverschillen kleiner wordt dan in Photoshop.
    const extra = Math.max(8, width * 0.04);
    if (justificationOf(paragraph?.justification) === "center") x -= extra / 2;
    else if (justificationOf(paragraph?.justification) === "right") x -= extra;
    width += extra;
  }

  const lineHeight =
    style.autoLeading === false && style.leading && rawSize ? round(style.leading / rawSize, 3) : 1.2;
  const letterSpacing = style.tracking ? round((style.tracking / 1000) * fontSize, 2) : 0;
  const text = (data?.text ?? "").replace(/\r\n?/g, "\n").trim();
  const textLines = Math.max(1, text.split("\n").length);
  const fitLines = Math.max(1, Math.floor((height + 0.5) / (fontSize * lineHeight)));
  const maxLines = Math.min(4, Math.max(textLines, fitLines));

  const postscriptName = style.font?.name?.trim() || undefined;
  const fromName = postscriptName ? weightFromName(postscriptName) : { weight: 400, italic: false };

  if (style.fauxBold) warnings.push(`${label}: "faux bold" wordt niet nagebootst; gebruik een echt vet lettertype.`);
  if (style.fauxItalic) warnings.push(`${label}: "faux italic" wordt niet nagebootst; gebruik een echt cursief lettertype.`);
  if (style.fontCaps === 1) warnings.push(`${label}: kleinkapitalen worden als gewone letters getoond.`);
  if (style.underline || style.strikethrough) warnings.push(`${label}: onderstrepen/doorhalen wordt niet nagebootst.`);
  if (style.baselineShift) warnings.push(`${label}: basislijnverschuiving wordt niet nagebootst.`);
  if (hasMixedStyles(data)) {
    warnings.push(`${label}: bevat verschillende lettertypen, groottes of kleuren; alleen de opmaak van het eerste teken wordt gebruikt.`);
  }
  if (data?.warp?.style && data.warp.style !== "none") warnings.push(`${label}: vervormde tekst (warp) wordt recht getoond.`);
  if (data?.textPath) warnings.push(`${label}: tekst op een pad wordt als gewone tekst getoond.`);
  if (data?.orientation === "vertical") warnings.push(`${label}: verticale tekst wordt horizontaal getoond.`);

  const effects = psdLayer.effects && !psdLayer.effects.disabled ? psdLayer.effects : undefined;
  let color = style.fillColor ? colorToHex(style.fillColor) : "#000000";
  const fill = effects?.solidFill?.find((f) => f.enabled !== false);
  if (fill?.color) color = colorToHex(fill.color);

  let stroke: TextLayer["stroke"];
  const psdStroke = effects?.stroke?.find((s) => s.enabled !== false);
  if (psdStroke) {
    if (psdStroke.fillType && psdStroke.fillType !== "color") warnings.push(`${label}: omlijning met verloop of patroon wordt effen getoond.`);
    if (psdStroke.position && psdStroke.position !== "outside") warnings.push(`${label}: omlijning wordt altijd buiten de letters getekend.`);
    stroke = { color: colorToRgba(psdStroke.color, psdStroke.opacity ?? 1), width: round(px(psdStroke.size) * scaleY, 1) };
  }

  let shadow: TextLayer["shadow"];
  const psdShadow = effects?.dropShadow?.find((s) => s.enabled !== false);
  if (psdShadow) {
    const distance = px(psdShadow.distance) * scaleY;
    const angle = ((psdShadow.angle ?? 120) * Math.PI) / 180;
    shadow = {
      color: colorToRgba(psdShadow.color, psdShadow.opacity ?? 0.75),
      blur: round(px(psdShadow.size) * scaleY, 1),
      offsetX: round(-Math.cos(angle) * distance, 1),
      offsetY: round(Math.sin(angle) * distance, 1),
    };
  }
  if (effects && (effects.gradientOverlay?.length || effects.outerGlow || effects.innerGlow || effects.bevel || effects.innerShadow?.length || effects.patternOverlay || effects.satin)) {
    warnings.push(`${label}: alleen de laageffecten omlijning, kleurbedekking en slagschaduw worden nagebootst.`);
  }

  const layer: TextLayer = {
    id: box.key,
    name: box.name,
    type: "text",
    field: box.key,
    x: round(x, 1),
    y: round(y, 1),
    width: round(width, 1),
    height: round(height, 1),
    rotation,
    opacity: psdLayer.opacity ?? 1,
    text: text || undefined,
    fontFamily: postscriptName ? postscriptName.split("-")[0] : "Inter",
    fontPostscriptName: postscriptName,
    fontWeight: fromName.weight,
    fontStyle: fromName.italic ? "italic" : "normal",
    fontSize,
    minFontSize: Math.max(12, Math.round(fontSize * 0.4)),
    color,
    align: justificationOf(paragraph?.justification),
    verticalAlign: "middle",
    uppercase: style.fontCaps === 2,
    letterSpacing,
    lineHeight,
    maxLines,
    allowTruncate: false,
    visibilityField: box.visibilityField,
    ...(stroke ? { stroke } : {}),
    ...(shadow ? { shadow } : {}),
  };
  return { layer, warnings };
}

function round(v: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function px(v: UnitsValue | undefined): number {
  return v && typeof v.value === "number" ? v.value : 0;
}

/** Het niet-gedraaide kader bij een assen-uitgelijnde omhullende (W×H) en een hoek. */
export function unrotateBox(W: number, H: number, degrees: number) {
  const a = (degrees * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const det = c * c - s * s;
  if (Math.abs(det) < 0.2) return null; // rond 45° niet eenduidig
  const width = (W * c - H * s) / det;
  const height = (H * c - W * s) / det;
  if (width <= 1 || height <= 1) return null;
  return { width, height };
}

function justificationOf(j: string | undefined): "left" | "center" | "right" {
  if (!j) return "left";
  if (j.includes("right")) return "right";
  if (j.includes("center")) return "center";
  return "left";
}

const WEIGHT_WORDS: [RegExp, number][] = [
  [/(hairline|thin)/i, 100],
  [/(extralight|ultralight)/i, 200],
  [/light/i, 300],
  [/(semibold|demibold|demi)/i, 600],
  [/(extrabold|ultrabold|heavy)/i, 800],
  [/black/i, 900],
  [/bold/i, 700],
  [/medium/i, 500],
];

export function weightFromName(postscriptName: string) {
  const suffix = postscriptName.includes("-") ? postscriptName.slice(postscriptName.indexOf("-") + 1) : postscriptName;
  const weight = WEIGHT_WORDS.find(([re]) => re.test(suffix))?.[1] ?? 400;
  return { weight, italic: /(italic|oblique)/i.test(suffix) };
}

function hasMixedStyles(data: LayerTextData | undefined): boolean {
  const runs = (data?.styleRuns ?? []).filter((r) => r.length > 0);
  if (runs.length < 2) return false;
  const sig = (s: TextStyle) => `${s.font?.name}|${s.fontSize}|${colorToHex(s.fillColor)}`;
  // Een laatste run met alleen een regeleinde telt niet mee.
  const text = data?.text ?? "";
  let offset = 0;
  const visible = runs.filter((r) => {
    const part = text.slice(offset, offset + r.length);
    offset += r.length;
    return part.trim().length > 0;
  });
  return new Set(visible.map((r) => sig(r.style))).size > 1;
}

export function colorToHex(c: unknown): string {
  const clamp = (v = 0) => Math.max(0, Math.min(255, Math.round(v)));
  const obj = (c ?? {}) as Record<string, number>;
  let rgb: number[] | null = null;
  if (typeof obj.r === "number") rgb = [obj.r, obj.g, obj.b];
  else if (typeof obj.fr === "number") rgb = [obj.fr * 255, obj.fg * 255, obj.fb * 255];
  if (!rgb) return "#000000";
  return `#${rgb.map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function colorToRgba(c: unknown, opacity: number): string {
  const hex = colorToHex(c);
  const n = parseInt(hex.slice(1), 16);
  const alpha = Math.max(0, Math.min(1, opacity));
  if (alpha >= 1) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${round(alpha, 3)})`;
}
