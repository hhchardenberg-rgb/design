import type { BlendMode, Layer, LayerMaskData, PixelData } from "ag-psd";

/**
 * Eigen compositor voor PSD-lagen, zodat vaste lagen in Photoshop-volgorde
 * en met Photoshop-regels worden samengevoegd:
 *  - dekking én vuldekking van de laag;
 *  - laagmaskers (ook buiten het maskerkader, via de standaardkleur);
 *  - uitknipmaskers (clipping) op de eerstvolgende basislaag eronder;
 *  - groepen: "doorlaten" (pass through) of als geheel samengevoegd met
 *    eigen dekking, overvloeimodus en masker;
 *  - overvloeimodi: de scheidbare modi en tint/verzadiging/kleur/helderheid;
 *  - lagen deels buiten het canvas worden bijgesneden (niet verschoven).
 *
 *  - slagschaduw van een laag (kleur, hoek, afstand, grootte, spreiding,
 *    overvloeimodus en dekking), onder de laag zelf.
 *
 * Wat niet kan (overige laageffecten, aanpassingslagen, exotische modi)
 * komt als melding terug, zodat het importrapport het kan tonen.
 *
 * Buffers zijn Float32 RGBA, niet-voorvermenigvuldigd, 0..1.
 */

export interface Canvas {
  width: number;
  height: number;
  data: Float32Array;
}

export function createBuffer(width: number, height: number): Canvas {
  return { width, height, data: new Float32Array(width * height * 4) };
}

export interface ComposeIssue {
  layer: string;
  message: string;
}

type Blend = (cb: number, cs: number) => number;

const SEPARABLE: Partial<Record<BlendMode, Blend>> = {
  normal: (_b, s) => s,
  dissolve: (_b, s) => s,
  multiply: (b, s) => b * s,
  screen: (b, s) => b + s - b * s,
  overlay: (b, s) => hardLight(s, b),
  darken: (b, s) => Math.min(b, s),
  lighten: (b, s) => Math.max(b, s),
  "color dodge": (b, s) => (b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s))),
  "color burn": (b, s) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s)),
  "hard light": (b, s) => hardLight(b, s),
  "soft light": (b, s) => softLight(b, s),
  difference: (b, s) => Math.abs(b - s),
  exclusion: (b, s) => b + s - 2 * b * s,
  "linear dodge": (b, s) => Math.min(1, b + s),
  "linear burn": (b, s) => Math.max(0, b + s - 1),
  subtract: (b, s) => Math.max(0, b - s),
  divide: (b, s) => (s <= 0 ? 1 : Math.min(1, b / s)),
  "vivid light": (b, s) =>
    s <= 0.5 ? (s <= 0 ? 0 : Math.max(0, 1 - (1 - b) / (2 * s))) : s >= 1 ? 1 : Math.min(1, b / (2 * (1 - s))),
  "linear light": (b, s) => Math.max(0, Math.min(1, b + 2 * s - 1)),
  "pin light": (b, s) => (s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1)),
  "hard mix": (b, s) => (b + s >= 1 ? 1 : 0),
};

function hardLight(b: number, s: number) {
  return s <= 0.5 ? b * 2 * s : b + (2 * s - 1) - b * (2 * s - 1);
}

function softLight(b: number, s: number) {
  if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
  const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
  return b + (2 * s - 1) * (d - b);
}

const NON_SEPARABLE = new Set<BlendMode>(["hue", "saturation", "color", "luminosity", "darker color", "lighter color"]);

export function isSupportedBlendMode(mode: BlendMode | undefined): boolean {
  return !mode || mode === "pass through" || mode in SEPARABLE || NON_SEPARABLE.has(mode);
}

// --- niet-scheidbare modi (W3C Compositing and Blending) ---
const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;
function clipColor(c: [number, number, number]): [number, number, number] {
  const l = lum(...c);
  const n = Math.min(...c);
  const x = Math.max(...c);
  let [r, g, b] = c;
  if (n < 0) [r, g, b] = [l + ((r - l) * l) / (l - n), l + ((g - l) * l) / (l - n), l + ((b - l) * l) / (l - n)];
  if (x > 1) [r, g, b] = [l + ((r - l) * (1 - l)) / (x - l), l + ((g - l) * (1 - l)) / (x - l), l + ((b - l) * (1 - l)) / (x - l)];
  return [r, g, b];
}
function setLum(c: [number, number, number], l: number) {
  const d = l - lum(...c);
  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
}
const sat = (c: number[]) => Math.max(...c) - Math.min(...c);
function setSat(c: [number, number, number], s: number): [number, number, number] {
  const max = Math.max(...c);
  const min = Math.min(...c);
  if (max === min) return [0, 0, 0];
  return c.map((v) => ((v - min) * s) / (max - min)) as [number, number, number];
}
function nonSeparable(mode: BlendMode, b: [number, number, number], s: [number, number, number]): [number, number, number] {
  switch (mode) {
    case "hue":
      return setLum(setSat(s, sat(b)), lum(...b));
    case "saturation":
      return setLum(setSat(b, sat(s)), lum(...b));
    case "color":
      return setLum(s, lum(...b));
    case "luminosity":
      return setLum(b, lum(...s));
    case "darker color":
      return lum(...s) < lum(...b) ? s : b;
    default: // lighter color
      return lum(...s) > lum(...b) ? s : b;
  }
}

/** Waarde 0..1 van een kanaal, ook voor 16- en 32-bits PSD's. */
function channel(data: PixelData["data"], i: number): number {
  if (data instanceof Float32Array) return Math.max(0, Math.min(1, data[i]));
  if (data instanceof Uint16Array) return data[i] / 65535;
  return data[i] / 255;
}

/**
 * Maskerwaarde per canvaspixel (0..1) voor een laag- of groepsmasker, of
 * null als er geen (actief) masker is.
 */
function maskSampler(mask: LayerMaskData | undefined): ((x: number, y: number) => number) | null {
  if (!mask || mask.disabled) return null;
  const left = mask.left ?? 0;
  const top = mask.top ?? 0;
  const def = (mask.defaultColor ?? 0) / 255;
  const img = mask.imageData;
  if (!img || img.width === 0 || img.height === 0) return () => def;
  const density = mask.userMaskDensity !== undefined ? mask.userMaskDensity / 255 : 1;
  return (x, y) => {
    const mx = x - left;
    const my = y - top;
    const v = mx < 0 || my < 0 || mx >= img.width || my >= img.height ? def : channel(img.data, (my * img.width + mx) * 4);
    return 1 - density * (1 - v);
  };
}

/**
 * Tekent één bron (laagpixels of een samengestelde groep) op het doel.
 * `alphaAt` levert per pixel de extra dekking (masker × uitknipmasker).
 */
function blendOnto(
  dst: Canvas,
  src: { left: number; top: number; width: number; height: number; at: (i: number) => [number, number, number, number] },
  mode: BlendMode,
  opacity: number,
  alphaAt: ((x: number, y: number) => number) | null
) {
  const sep = SEPARABLE[mode] ?? (NON_SEPARABLE.has(mode) ? null : SEPARABLE.normal!);
  const x0 = Math.max(0, src.left);
  const y0 = Math.max(0, src.top);
  const x1 = Math.min(dst.width, src.left + src.width);
  const y1 = Math.min(dst.height, src.top + src.height);
  const d = dst.data;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const [sr, sg, sb, sa0] = src.at((y - src.top) * src.width + (x - src.left));
      let sa = sa0 * opacity;
      if (sa <= 0) continue;
      if (alphaAt) {
        sa *= alphaAt(x, y);
        if (sa <= 0) continue;
      }
      const o = (y * dst.width + x) * 4;
      const ba = d[o + 3];
      let mr = sr, mg = sg, mb = sb;
      if (ba > 0 && mode !== "normal" && mode !== "dissolve" && mode !== "pass through") {
        const br = d[o], bg = d[o + 1], bb = d[o + 2];
        let blended: [number, number, number];
        if (sep) blended = [sep(br, sr), sep(bg, sg), sep(bb, sb)];
        else blended = nonSeparable(mode, [br, bg, bb], [sr, sg, sb]);
        mr = (1 - ba) * sr + ba * blended[0];
        mg = (1 - ba) * sg + ba * blended[1];
        mb = (1 - ba) * sb + ba * blended[2];
      }
      const oa = sa + ba * (1 - sa);
      d[o] = (sa * mr + ba * d[o] * (1 - sa)) / oa;
      d[o + 1] = (sa * mg + ba * d[o + 1] * (1 - sa)) / oa;
      d[o + 2] = (sa * mb + ba * d[o + 2] * (1 - sa)) / oa;
      d[o + 3] = oa;
    }
  }
}

function pixelSource(layer: Layer) {
  const img = layer.imageData!;
  const data = img.data;
  return {
    left: layer.left ?? 0,
    top: layer.top ?? 0,
    width: img.width,
    height: img.height,
    at: (i: number): [number, number, number, number] => [
      channel(data, i * 4),
      channel(data, i * 4 + 1),
      channel(data, i * 4 + 2),
      channel(data, i * 4 + 3),
    ],
  };
}

function bufferSource(buf: Canvas) {
  const d = buf.data;
  return {
    left: 0,
    top: 0,
    width: buf.width,
    height: buf.height,
    at: (i: number): [number, number, number, number] => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2], d[i * 4 + 3]],
  };
}

/** Alfa (0..1) van een laag zelf, inclusief masker: de basis voor uitknippen. */
function layerAlpha(layer: Layer): ((x: number, y: number) => number) | null {
  if (!layer.imageData) return null;
  const img = layer.imageData;
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  const mask = maskSampler(layer.mask);
  return (x, y) => {
    const lx = x - left;
    const ly = y - top;
    if (lx < 0 || ly < 0 || lx >= img.width || ly >= img.height) return 0;
    const a = channel(img.data, (ly * img.width + lx) * 4 + 3);
    return mask ? a * mask(x, y) : a;
  };
}

export interface ComposeOptions {
  /** Welke lagen meedoen; standaard alle zichtbare. */
  include?: (layer: Layer) => boolean;
  /** Groepsmaskers en -dekking van bovenliggende groepen (intern). */
  issues?: ComposeIssue[];
  /** Algemene lichthoek van het document (voor "algemeen licht gebruiken"). */
  globalAngle?: number;
}

const opacityOf = (layer: Layer) => (layer.opacity ?? 1) * (layer.fillOpacity ?? 1);

/**
 * Componeert een lijst lagen (onderaan eerst, zoals ag-psd ze levert) op
 * `dst`. Groepen worden recursief verwerkt.
 */
export function composeLayers(dst: Canvas, layers: Layer[], options: ComposeOptions = {}, inherited: InheritedGroup | null = null) {
  const issues = options.issues ?? [];
  let base: Layer | null = null;
  for (const layer of layers) {
    if (layer.hidden) {
      if (!layer.clipping) base = null;
      continue;
    }
    const name = layer.name ?? "naamloos";
    const included = options.include ? options.include(layer) : true;
    const clipped = Boolean(layer.clipping) && base !== null;
    if (!layer.clipping) base = layer;

    if (layer.children) {
      if (!included) continue;
      composeGroup(dst, layer, options, inherited);
      continue;
    }
    if (!included) continue;
    if (layer.adjustment) {
      issues.push({ layer: name, message: "aanpassingslaag wordt niet toegepast" });
      continue;
    }
    if (!layer.imageData) continue;
    if (hasUnsupportedEffects(layer)) issues.push({ layer: name, message: "laageffecten (gloed, omlijning, bedekking) worden niet nagebootst" });
    const mode = layer.blendMode ?? "normal";
    if (!isSupportedBlendMode(mode)) issues.push({ layer: name, message: `overvloeimodus "${mode}" wordt als normaal getoond` });

    const own = maskSampler(layer.mask);
    const clip = clipped ? layerAlpha(base!) : null;
    const group = inherited?.mask ?? null;
    const factors = [own, clip, group].filter(Boolean) as ((x: number, y: number) => number)[];
    const alphaAt = product(factors);
    // De schaduw volgt de vorm van de laag (met masker) en valt binnen het
    // uitknipmasker en groepsmasker. Effecten volgen de laagdekking, niet de
    // vuldekking.
    const outer = product([clip, group].filter(Boolean) as ((x: number, y: number) => number)[]);
    // Effecten volgen de laagdekking, niet de vuldekking.
    for (const shadow of dropShadowsOf(layer)) {
      const src = dropShadowSource(layer, shadow, options.globalAngle ?? 30);
      if (!src) continue;
      const shadowMode = shadow.blendMode ?? "multiply";
      blendOnto(dst, src, isSupportedBlendMode(shadowMode) ? shadowMode : "multiply", (shadow.opacity ?? 0.75) * (layer.opacity ?? 1) * (inherited?.opacity ?? 1), outer);
    }
    blendOnto(dst, pixelSource(layer), isSupportedBlendMode(mode) ? mode : "normal", opacityOf(layer) * (inherited?.opacity ?? 1), alphaAt);
  }
}

function product(factors: ((x: number, y: number) => number)[]): ((x: number, y: number) => number) | null {
  if (factors.length === 0) return null;
  if (factors.length === 1) return factors[0];
  return (x, y) => factors.reduce((acc, f) => acc * f(x, y), 1);
}

type DropShadow = NonNullable<NonNullable<Layer["effects"]>["dropShadow"]>[number];

function dropShadowsOf(layer: Layer): DropShadow[] {
  const e = layer.effects;
  if (!e || e.disabled) return [];
  // Photoshop tekent de onderste schaduw uit de lijst het eerst.
  return (e.dropShadow ?? []).filter((d) => d.enabled !== false).reverse();
}

const unitPx = (v: { value: number; units: string } | undefined) => (v && v.units === "Pixels" ? v.value : v?.value ?? 0);

/**
 * Slagschaduw als bron voor blendOnto: de alfa van de laag (met masker),
 * verschoven over de lichthoek, verbreed met de spreiding en vervaagd met
 * de grootte. Drie keer een kastfilter benadert de vervaging van Photoshop.
 */
function dropShadowSource(layer: Layer, shadow: DropShadow, globalAngle: number) {
  const img = layer.imageData;
  if (!img || img.width === 0 || img.height === 0) return null;
  const angle = (((shadow.useGlobalLight ? globalAngle : shadow.angle ?? 120) ?? 120) * Math.PI) / 180;
  const distance = unitPx(shadow.distance);
  const size = Math.max(0, unitPx(shadow.size));
  const spread = Math.min(1, Math.max(0, unitPx(shadow.choke) / 100));
  const dx = Math.round(-Math.cos(angle) * distance);
  const dy = Math.round(Math.sin(angle) * distance);
  const pad = Math.ceil(size) + 1;
  const left = (layer.left ?? 0) + dx - pad;
  const top = (layer.top ?? 0) + dy - pad;
  const w = img.width + 2 * pad;
  const h = img.height + 2 * pad;
  const shape = layerAlpha(layer)!;
  let a: Float32Array = new Float32Array(w * h);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      a[(y + pad) * w + x + pad] = shape(x + (layer.left ?? 0), y + (layer.top ?? 0));
    }
  }
  // Spreiding maakt de rand harder vóór het vervagen.
  const blurRadius = size * (1 - spread);
  if (blurRadius >= 0.5) a = boxBlur3(a, w, h, blurRadius);
  if (spread > 0) for (let i = 0; i < a.length; i++) a[i] = Math.min(1, a[i] / (1 - spread + 1e-6));
  const r = (shadow.color && "r" in shadow.color ? shadow.color.r : 0) / 255;
  const g = (shadow.color && "g" in shadow.color ? shadow.color.g : 0) / 255;
  const b = (shadow.color && "b" in shadow.color ? shadow.color.b : 0) / 255;
  return { left, top, width: w, height: h, at: (i: number): [number, number, number, number] => [r, g, b, a[i]] };
}

/** Drie kastfilters (horizontaal en verticaal) ≈ gaussische vervaging. */
function boxBlur3(src: Float32Array, w: number, h: number, size: number): Float32Array {
  // Photoshop's grootte is ongeveer de afstand waarover de rand uitloopt:
  // drie kasten van samen die breedte.
  const r = Math.max(1, Math.round(size / 3));
  const a = Float32Array.from(src);
  const tmp = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    boxPass(a, tmp, w, h, r, true);
    boxPass(tmp, a, w, h, r, false);
  }
  return a;
}

function boxPass(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean) {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const step = horizontal ? 1 : w;
  const scale = 1 / (2 * r + 1);
  for (let line = 0; line < lines; line++) {
    const start = horizontal ? line * w : line;
    let sum = 0;
    for (let i = -r; i <= r; i++) if (i >= 0 && i < len) sum += src[start + i * step];
    for (let i = 0; i < len; i++) {
      dst[start + i * step] = sum * scale;
      const out = i - r;
      const inn = i + r + 1;
      if (out >= 0) sum -= src[start + out * step];
      if (inn < len) sum += src[start + inn * step];
    }
  }
}

/** Effecten die de compositor (nog) niet nabootst. */
export function hasUnsupportedEffects(layer: Layer): boolean {
  const e = layer.effects;
  if (!e || e.disabled) return false;
  const on = (x: { enabled?: boolean } | undefined) => Boolean(x && x.enabled !== false);
  const any = (xs: { enabled?: boolean }[] | undefined) => Boolean(xs?.some((x) => x.enabled !== false));
  return (
    any(e.innerShadow) ||
    on(e.outerGlow) ||
    on(e.innerGlow) ||
    on(e.bevel) ||
    any(e.solidFill) ||
    on(e.satin) ||
    any(e.stroke) ||
    any(e.gradientOverlay) ||
    on(e.patternOverlay)
  );
}

interface InheritedGroup {
  opacity: number;
  mask: ((x: number, y: number) => number) | null;
}

function composeGroup(dst: Canvas, group: Layer, options: ComposeOptions, inherited: InheritedGroup | null) {
  const mode = group.blendMode ?? "pass through";
  const groupMask = maskSampler(group.mask);
  if (mode === "pass through") {
    // Kinderen rechtstreeks op de onderlaag, met de dekking en het masker
    // van de groep (en van bovenliggende doorlaat-groepen) erbij.
    const parentMask = inherited?.mask ?? null;
    const mask =
      groupMask && parentMask ? (x: number, y: number) => groupMask(x, y) * parentMask(x, y) : groupMask ?? parentMask;
    composeLayers(dst, group.children ?? [], options, { opacity: (inherited?.opacity ?? 1) * opacityOf(group), mask });
    return;
  }
  const buf = createBuffer(dst.width, dst.height);
  composeLayers(buf, group.children ?? [], options, null);
  const parentMask = inherited?.mask ?? null;
  const mask = groupMask && parentMask ? (x: number, y: number) => groupMask(x, y) * parentMask(x, y) : groupMask ?? parentMask;
  blendOnto(dst, bufferSource(buf), isSupportedBlendMode(mode) ? mode : "normal", opacityOf(group) * (inherited?.opacity ?? 1), mask);
}

export function hasEffects(layer: Layer): boolean {
  const e = layer.effects;
  if (!e || e.disabled) return false;
  const on = (x: { enabled?: boolean } | undefined) => Boolean(x && x.enabled !== false);
  const any = (xs: { enabled?: boolean }[] | undefined) => Boolean(xs?.some((x) => x.enabled !== false));
  return (
    any(e.dropShadow) ||
    any(e.innerShadow) ||
    on(e.outerGlow) ||
    on(e.innerGlow) ||
    on(e.bevel) ||
    any(e.solidFill) ||
    on(e.satin) ||
    any(e.stroke) ||
    any(e.gradientOverlay) ||
    on(e.patternOverlay)
  );
}

/** Buffer naar 8-bit RGBA (voor sharp). */
export function toRgba8(buf: Canvas): Buffer {
  const out = Buffer.alloc(buf.width * buf.height * 4);
  const d = buf.data;
  for (let i = 0; i < d.length; i++) out[i] = Math.round(Math.max(0, Math.min(1, d[i])) * 255);
  return out;
}

/** Kleinste kader met zichtbare pixels, of null als alles transparant is. */
export function alphaBounds(buf: Canvas, threshold = 1 / 255) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      if (buf.data[(y * buf.width + x) * 4 + 3] >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Normale (source-over) stapeling van een buffer op een ander, voor de controle. */
export function stackNormal(dst: Canvas, src: Canvas) {
  blendOnto(dst, bufferSource(src), "normal", 1, null);
}

/** Converteert ag-psd PixelData (bv. de samengestelde afbeelding) naar een buffer. */
export function bufferFromPixels(img: PixelData): Canvas {
  const buf = createBuffer(img.width, img.height);
  for (let i = 0; i < buf.data.length; i++) buf.data[i] = channel(img.data, i);
  return buf;
}

export interface DiffResult {
  /** Aandeel pixels dat zichtbaar verschilt (0..1). */
  changedRatio: number;
  /** Gemiddeld verschil per kanaal (0..255). */
  meanDelta: number;
  /** Diff-afbeelding (RGBA 8-bit): referentie gedimd, verschillen rood. */
  image: Buffer;
}

/**
 * Vergelijkt twee buffers, beide samengevoegd op wit. Een pixel telt als
 * verschillend boven `threshold` (0..1) in een kanaal.
 */
export function diffBuffers(a: Canvas, b: Canvas, threshold = 24 / 255): DiffResult {
  const n = a.width * a.height;
  const out = Buffer.alloc(n * 4);
  let changed = 0;
  let total = 0;
  const flat = (d: Float32Array, o: number, c: number) => d[o + c] * d[o + 3] + (1 - d[o + 3]);
  for (let p = 0; p < n; p++) {
    const o = p * 4;
    let max = 0;
    let gray = 0;
    for (let c = 0; c < 3; c++) {
      const va = flat(a.data, o, c);
      const vb = flat(b.data, o, c);
      const delta = Math.abs(va - vb);
      total += delta;
      if (delta > max) max = delta;
      gray += va / 3;
    }
    const isChanged = max > threshold;
    if (isChanged) changed++;
    const g = Math.round(200 + gray * 55);
    out[o] = isChanged ? 230 : g;
    out[o + 1] = isChanged ? 30 : g;
    out[o + 2] = isChanged ? 30 : g;
    out[o + 3] = 255;
  }
  return { changedRatio: changed / n, meanDelta: (total / (n * 3)) * 255, image: out };
}
