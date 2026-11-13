import type { AdjustmentLayer, Color, CurvesAdjustmentChannel, LevelsAdjustmentChannel } from "ag-psd";

/**
 * Aanpassingslagen uit Photoshop als kleurfunctie per pixel (RGB 0..1).
 * Geeft null terug voor typen die (nog) niet nagebootst worden.
 *
 * Exact volgens Photoshop:  omkeren, drempel, posteriseren, niveaus.
 * Benadering:               helderheid/contrast (Photoshop publiceert de
 *                           formule niet), curven (vloeiende kromme door de
 *                           punten), verloopkaart (zonder ruis/dithering).
 */
export type AdjustFn = (r: number, g: number, b: number) => [number, number, number];

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Helderheid zoals Photoshop die voor verloopkaart, drempel en zwart-wit gebruikt. */
const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

export function adjustmentFunction(adj: AdjustmentLayer): AdjustFn | null {
  switch (adj.type) {
    case "invert":
      return (r, g, b) => [1 - r, 1 - g, 1 - b];
    case "threshold": {
      const level = (adj.level ?? 128) / 255;
      return (r, g, b) => {
        const v = luma(r, g, b) >= level ? 1 : 0;
        return [v, v, v];
      };
    }
    case "posterize": {
      const n = Math.max(2, Math.min(255, adj.levels ?? 4));
      const f = (v: number) => Math.round(Math.floor(v * n * 0.99999) * (255 / (n - 1))) / 255;
      return (r, g, b) => [f(r), f(g), f(b)];
    }
    case "brightness/contrast":
      return brightnessContrast(adj.brightness ?? 0, adj.contrast ?? 0, adj.meanValue ?? 127, Boolean(adj.useLegacy));
    case "levels":
      return perChannel(adj.rgb && levelsCurve(adj.rgb), adj.red && levelsCurve(adj.red), adj.green && levelsCurve(adj.green), adj.blue && levelsCurve(adj.blue));
    case "curves":
      return perChannel(adj.rgb && curvesCurve(adj.rgb), adj.red && curvesCurve(adj.red), adj.green && curvesCurve(adj.green), adj.blue && curvesCurve(adj.blue));
    case "gradient map":
      return gradientMap(adj);
    default:
      return null;
  }
}

type Curve = (v: number) => number;

/** Eerst de RGB-kromme, dan per kanaal (zoals in Photoshop). Opgezocht via een tabel. */
function perChannel(all?: Curve, red?: Curve, green?: Curve, blue?: Curve): AdjustFn {
  const table = (c?: Curve) => {
    const t = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      let v = i / 1023;
      if (all) v = all(v);
      if (c) v = c(clamp(v));
      t[i] = clamp(v);
    }
    return t;
  };
  const tr = table(red), tg = table(green), tb = table(blue);
  const at = (t: Float32Array, v: number) => t[Math.round(clamp(v) * 1023)];
  return (r, g, b) => [at(tr, r), at(tg, g), at(tb, b)];
}

function levelsCurve(ch: LevelsAdjustmentChannel): Curve {
  const inLo = ch.shadowInput / 255;
  const inHi = ch.highlightInput / 255;
  const outLo = ch.shadowOutput / 255;
  const outHi = ch.highlightOutput / 255;
  // midtoneInput is de gamma (ag-psd levert 1 als neutraal).
  const gamma = ch.midtoneInput > 0 ? ch.midtoneInput : 1;
  const span = Math.max(1e-6, inHi - inLo);
  return (v) => outLo + (outHi - outLo) * Math.pow(clamp((v - inLo) / span), 1 / gamma);
}

/** Monotone kubische kromme door de punten (Fritsch-Carlson). */
function curvesCurve(points: CurvesAdjustmentChannel): Curve {
  const pts = [...points].map((p) => ({ x: p.input / 255, y: p.output / 255 })).sort((a, b) => a.x - b.x);
  if (pts.length < 2) return (v) => v;
  const n = pts.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1].y - pts[i].y) / Math.max(1e-6, pts[i + 1].x - pts[i].x));
  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (v) => {
    if (v <= pts[0].x) return pts[0].y;
    if (v >= pts[n - 1].x) return pts[n - 1].y;
    let i = 0;
    while (v > pts[i + 1].x) i++;
    const h = pts[i + 1].x - pts[i].x;
    const t = (v - pts[i].x) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * pts[i].y + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * pts[i + 1].y + (t3 - t2) * h * m[i + 1];
  };
}

function brightnessContrast(brightness: number, contrast: number, meanValue: number, legacy: boolean): AdjustFn {
  let curve: Curve;
  if (legacy) {
    // Oude methode: verschuiven en rond het midden uitrekken.
    const k = contrast >= 0 ? 1 / Math.max(1e-3, 1 - contrast / 100) : 1 + contrast / 100;
    curve = (v) => clamp((v + brightness / 255 - 0.5) * k + 0.5);
  } else {
    // Huidige methode: helderheid als gammakromme (zwart en wit blijven),
    // contrast rond de gemiddelde helderheid van het beeld.
    const gamma = brightness >= 0 ? 1 / (1 + brightness / 100) : 1 - brightness / 100;
    const mean = clamp(meanValue / 255);
    const k = contrast >= 0 ? 1 + contrast / 100 : 1 + contrast / 100;
    curve = (v) => clamp(mean + (Math.pow(v, gamma) - mean) * k);
  }
  return perChannel(curve);
}

function colorToRgb(c: Color | undefined): [number, number, number] {
  if (!c) return [0, 0, 0];
  const o = c as Record<string, number>;
  if (typeof o.r === "number") return [o.r / 255, o.g / 255, o.b / 255];
  if (typeof o.fr === "number") return [o.fr, o.fg, o.fb];
  if (typeof o.k === "number" && typeof o.c !== "number") return [1 - o.k / 100, 1 - o.k / 100, 1 - o.k / 100];
  return [0, 0, 0];
}

function gradientMap(adj: Extract<AdjustmentLayer, { type: "gradient map" }>): AdjustFn | null {
  if (adj.gradientType === "noise") return null;
  const raw = adj.colorStops ?? [];
  if (raw.length === 0) return null;
  // ag-psd levert de positie in Photoshop-eenheden (0..4096) of al als 0..1.
  const scale = raw.some((s) => s.location > 1) ? 4096 : 1;
  const stops = raw
    .map((s) => ({ t: clamp(s.location / scale), mid: s.midpoint > 1 ? s.midpoint / 100 : s.midpoint || 0.5, rgb: colorToRgb(s.color) }))
    .sort((a, b) => a.t - b.t);
  const table = new Float32Array(1024 * 3);
  for (let i = 0; i < 1024; i++) {
    let t = i / 1023;
    if (adj.reverse) t = 1 - t;
    let rgb: [number, number, number];
    if (t <= stops[0].t) rgb = stops[0].rgb;
    else if (t >= stops[stops.length - 1].t) rgb = stops[stops.length - 1].rgb;
    else {
      let j = 0;
      while (t > stops[j + 1].t) j++;
      const a = stops[j], b = stops[j + 1];
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      // Middelpunt: waar de kleuren half-half gemengd zijn (van de rechterstop).
      const m = Math.min(0.95, Math.max(0.05, b.mid));
      const w = u < m ? 0.5 * (u / m) : 0.5 + 0.5 * ((u - m) / (1 - m));
      rgb = [a.rgb[0] + (b.rgb[0] - a.rgb[0]) * w, a.rgb[1] + (b.rgb[1] - a.rgb[1]) * w, a.rgb[2] + (b.rgb[2] - a.rgb[2]) * w];
    }
    table.set(rgb, i * 3);
  }
  return (r, g, b) => {
    const o = Math.round(clamp(luma(r, g, b)) * 1023) * 3;
    return [table[o], table[o + 1], table[o + 2]];
  };
}
