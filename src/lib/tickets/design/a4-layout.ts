// A4-indeling van een ticket (210 × 297 mm, staand). Berekent alle posities één keer; daarna
// tekent de pdf-generator (server) of het voorbeeld in de editor (svg) exact dezelfde vakken.
// Puur: het meten van tekst gaat via een meegegeven Measurer (pdf-lib met de echte lettertypen).
//
// Garanties: alles blijft binnen de marges (min. 10 mm), één pagina, de QR-code en de hoofdtekst
// worden niet onbeperkt verkleind. Past het niet, dan vallen eerst optionele onderdelen weg en
// komt er een melding; er ontstaat nooit automatisch een tweede pagina.

import type { AssetRef, TicketView, ViewBlock } from "./view";
import type { DesignIssue } from "./validate";
import { qrMatrix } from "./qr-matrix";

export const PT_PER_MM = 72 / 25.4;
export const A4_W = 595.28;
export const A4_H = 841.89;

export type FontKey = "din-medium" | "din-bold" | "din-black" | "inter-400" | "inter-600" | "inter-700" | "inter-800";
export interface Measurer {
  width(text: string, font: FontKey, size: number): number;
  /** Vervangt tekens die het lettertype niet kent (nooit een leeg vakje in de pdf). */
  clean(text: string, font: FontKey): string;
}

export type A4Box =
  | { t: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; strokeWidth?: number; radius?: number; opacity?: number }
  | { t: "text"; x: number; y: number; size: number; font: FontKey; color: string; text: string; rotate?: number; opacity?: number }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dash?: number[] }
  | { t: "image"; x: number; y: number; w: number; h: number; asset: AssetRef; opacity?: number; crop?: { sx: number; sy: number; sw: number; sh: number } }
  | { t: "qr"; x: number; y: number; size: number; code: string };

export interface A4Layout {
  width: number;
  height: number;
  boxes: A4Box[];
  issues: DesignIssue[];
  /** Wat automatisch is aangepast om op één pagina te passen. */
  degradations: string[];
  /** Ruimte die overblijft (pt); negatief = paste niet. */
  spare: number;
  sample: boolean;
  generatedAt: string | null;
}

const mm = (n: number) => n * PT_PER_MM;

function headingKey(v: TicketView): FontKey {
  const w = v.style.headingWeight;
  if (v.style.headingFont === "din") return w === "medium" ? "din-medium" : w === "bold" ? "din-bold" : "din-black";
  return w === "medium" ? "inter-600" : w === "bold" ? "inter-700" : "inter-800";
}
const bodyKey = (v: TicketView): FontKey => (v.style.bodyFont === "din" ? "din-medium" : "inter-400");
const bodyBoldKey = (v: TicketView): FontKey => (v.style.bodyFont === "din" ? "din-bold" : "inter-700");

/** Tint van een kleur (mengen met wit). */
export function tint(hex: string, amount: number): string {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const m = c.map((x) => Math.round(x + (255 - x) * (1 - amount)));
  return `#${m.map((x) => x.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Tekst afbreken op woorden; te lange woorden op tekens. Respecteert harde regeleinden. */
export function wrap(m: Measurer, text: string, font: FontKey, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of m.clean(text, font).split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (m.width(candidate, font, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      if (m.width(word, font, size) <= maxWidth) {
        line = word;
        continue;
      }
      let part = "";
      for (const ch of word) {
        if (m.width(part + ch, font, size) > maxWidth && part) {
          out.push(part);
          part = ch;
        } else part += ch;
      }
      line = part;
    }
    if (line) out.push(line);
    if (!words.length) out.push("");
  }
  return out;
}

/** Past de tekst in maximaal `maxLines` regels, eventueel iets kleiner, maar nooit kleiner dan `minSize`. */
function fitText(m: Measurer, text: string, font: FontKey, size: number, minSize: number, maxWidth: number, maxLines: number): { lines: string[]; size: number; fits: boolean } {
  for (let s = size; s >= minSize; s -= 1) {
    const lines = wrap(m, text, font, s, maxWidth);
    if (lines.length <= maxLines) return { lines, size: s, fits: true };
  }
  const lines = wrap(m, text, font, minSize, maxWidth);
  const kept = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let last = kept[maxLines - 1];
    while (last && m.width(`${last}…`, font, minSize) > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
  }
  return { lines: kept, size: minSize, fits: false };
}

interface Options {
  dropHero: boolean;
  dropExtra: boolean;
  smallSponsors: boolean;
  compact: boolean;
  trimInfo: boolean;
}

export function layoutA4(view: TicketView, m: Measurer, opts: { generatedAt?: string | null } = {}): A4Layout {
  const steps: [keyof Options, string][] = [
    ["compact", "De witruimte is verkleind."],
    ["dropHero", "Het sfeerbeeld is weggelaten."],
    ["smallSponsors", "De sponsorlogo's zijn kleiner gemaakt."],
    ["dropExtra", "Het vrije tekstblok is weggelaten."],
    ["trimInfo", "De praktische informatie is ingekort."],
  ];
  const o: Options = { dropHero: false, dropExtra: false, smallSponsors: false, compact: false, trimInfo: false };
  const degradations: string[] = [];
  let result = layoutOnce(view, m, o, opts.generatedAt ?? null);
  for (const [k, label] of steps) {
    if (result.spare >= 0) break;
    o[k] = true;
    degradations.push(label);
    result = layoutOnce(view, m, o, opts.generatedAt ?? null);
  }
  const issues = [...result.issues];
  if (result.spare < 0) issues.push({ level: "error", message: "De inhoud past niet op één A4-pagina. Kort teksten in, kies minder sponsorlogo's of verberg een blok.", format: "a4" });
  else if (degradations.length) issues.push({ level: "warning", message: `Om op één A4-pagina te passen: ${degradations.join(" ")}`, format: "a4" });
  return { ...result, issues, degradations };
}

function layoutOnce(view: TicketView, m: Measurer, o: Options, generatedAt: string | null): A4Layout {
  const s = view.style;
  const ink = view.a4.inkSaver;
  const boxes: A4Box[] = [];
  const issues: DesignIssue[] = [];
  const margin = mm(Math.max(10, view.a4.margin));
  const left = margin;
  const cw = A4_W - 2 * margin;
  const gap = mm(o.compact ? 3 : s.spacing === "compact" ? 4 : s.spacing === "ruim" ? 8 : 6);
  const scale = s.scale;
  const H = headingKey(view);
  const B = bodyKey(view);
  const BB = bodyBoldKey(view);
  const text = ink ? "#000000" : s.text;
  const muted = ink ? "#333333" : s.muted;
  const radius = Math.min(s.radius, 12);
  const align = s.align;
  const xFor = (w: number, x0: number, width: number) => (align === "center" ? x0 + (width - w) / 2 : x0);

  if (!ink && view.a4.background === "tint") boxes.push({ t: "rect", x: 0, y: 0, w: A4_W, h: A4_H, fill: tint(s.accent, 0.07) });

  // Voettekst: altijd onderaan, compact.
  const footer = view.blocks.find((b) => b.id === "footer") as Extract<ViewBlock, { id: "footer" }> | undefined;
  const footerBoxes: A4Box[] = [];
  let footerH = 0;
  if (footer) {
    const fs = 7.5 * Math.min(scale, 1.05);
    const termLines = footer.terms ? wrap(m, footer.terms, B, fs, cw) : [];
    const meta = [`Ticketnummer ${footer.ticketNumber}`, footer.contact, footer.version, generatedAt ? `Aangemaakt op ${generatedAt}` : null].filter(Boolean).join("  ·  ");
    const metaLines = wrap(m, meta, B, fs * 0.95, cw);
    const lh = fs * 1.35;
    footerH = mm(3) + (termLines.length + metaLines.length) * lh + mm(1);
    let fy = A4_H - margin - footerH;
    footerBoxes.push({ t: "line", x1: left, y1: fy, x2: left + cw, y2: fy, color: ink ? "#000000" : s.accent, width: 1 });
    fy += mm(3);
    for (const l of termLines) {
      fy += lh;
      footerBoxes.push({ t: "text", x: left, y: fy - lh * 0.25, size: fs, font: B, color: muted, text: l });
    }
    for (const l of metaLines) {
      fy += lh;
      footerBoxes.push({ t: "text", x: left, y: fy - lh * 0.25, size: fs * 0.95, font: BB, color: text, text: l });
    }
  }
  const limit = A4_H - margin - footerH - gap;

  let y = margin;
  const panelIds = new Set(view.a4.columns === 2 ? ["qr", "type", "holder", "access"] : []);
  let panelDone = false;

  for (const b of view.blocks) {
    if (b.id === "footer") continue;
    if (panelIds.has(b.id)) {
      if (panelDone) continue;
      panelDone = true;
      y = panel(y);
      y += gap;
      continue;
    }
    const before = y;
    switch (b.id) {
      case "header":
        y = header(b, y);
        break;
      case "hero":
        if (o.dropHero || ink) break;
        y = hero(b, y);
        break;
      case "match":
        y = match(b, y);
        break;
      case "type":
        y = typeBlock(b, left, cw, y);
        break;
      case "holder":
        y = holder(b, left, cw, y);
        break;
      case "access":
        y = access(b, left, cw, y);
        break;
      case "qr":
        y = qrStack(b, y);
        break;
      case "message":
        y = message(b, y);
        break;
      case "info":
        y = info(b, y);
        break;
      case "extra":
        if (o.dropExtra) break;
        y = extra(b, y);
        break;
      case "sponsors":
        y = sponsors(b, y);
        break;
    }
    if (y !== before) y += gap;
  }

  boxes.push(...footerBoxes);
  if (view.sample) {
    boxes.push({ t: "rect", x: 0, y: 0, w: A4_W, h: mm(7), fill: "#B91C1C" });
    const label = m.clean("VOORBEELD – GEEN TOEGANG – NIET GELDIG BIJ DE INGANG", "inter-700");
    boxes.push({ t: "text", x: (A4_W - m.width(label, "inter-700", 9)) / 2, y: mm(4.8), size: 9, font: "inter-700", color: "#FFFFFF", text: label });
    const wm = m.clean("VOORBEELD", "inter-800");
    boxes.push({ t: "text", x: A4_W / 2 - m.width(wm, "inter-800", 90) / 2 * Math.cos(Math.PI / 5) , y: A4_H / 2 + 120, size: 90, font: "inter-800", color: "#B91C1C", text: wm, rotate: 36, opacity: 0.08 });
  }

  return { width: A4_W, height: A4_H, boxes, issues, degradations: [], spare: limit - (y - gap), sample: view.sample, generatedAt };

  // ── Blokken ────────────────────────────────────────────────────────────────

  function header(b: Extract<ViewBlock, { id: "header" }>, y0: number): number {
    const h = mm(24);
    if (!ink) boxes.push({ t: "rect", x: left, y: y0, w: cw, h, fill: s.primary, radius });
    else boxes.push({ t: "line", x1: left, y1: y0 + h, x2: left + cw, y2: y0 + h, color: "#000000", width: 1.5 });
    let x = left + mm(6);
    if (b.logo) {
      const lh = h - mm(6);
      const lw = Math.min((b.logo.width / b.logo.height) * lh, mm(40));
      boxes.push({ t: "image", x, y: y0 + mm(3), w: lw, h: lh, asset: b.logo });
      x += lw + mm(5);
    }
    if (b.clubName) {
      const size = 20 * scale;
      const fit = fitText(m, b.clubName, H, size, 14, left + cw - x - mm(6), 1);
      boxes.push({ t: "text", x, y: y0 + h / 2 + fit.size * 0.35, size: fit.size, font: H, color: ink ? "#000000" : s.onPrimary, text: fit.lines[0] });
    }
    return y0 + h;
  }

  function hero(b: Extract<ViewBlock, { id: "hero" }>, y0: number): number {
    const h = mm(b.height === "laag" ? 28 : b.height === "hoog" ? 62 : 42);
    if (!b.image) {
      boxes.push({ t: "rect", x: left, y: y0, w: cw, h, fill: s.primary, radius });
      return y0 + h;
    }
    const img = b.image;
    const boxRatio = cw / h;
    const imgRatio = img.width / img.height;
    let sw = img.width;
    let sh = img.height;
    if (imgRatio > boxRatio) sw = img.height * boxRatio;
    else sh = img.width / boxRatio;
    const sx = Math.round((img.width - sw) * (b.focusX / 100));
    const sy = Math.round((img.height - sh) * (b.focusY / 100));
    boxes.push({ t: "rect", x: left, y: y0, w: cw, h, fill: s.primary, radius });
    boxes.push({ t: "image", x: left, y: y0, w: cw, h, asset: img, opacity: b.opacity, crop: { sx, sy, sw: Math.round(sw), sh: Math.round(sh) } });
    return y0 + h;
  }

  function match(b: Extract<ViewBlock, { id: "match" }>, y0: number): number {
    let y = y0;
    const logo = mm(18);
    const hasLogos = !!(b.homeLogo || b.awayLogo);
    const textX = hasLogos ? left + logo + mm(5) : left;
    const textW = hasLogos ? cw - 2 * (logo + mm(5)) : cw;
    if (b.overline) {
      const size = 10 * scale;
      const l = fitText(m, b.overline.toUpperCase(), BB, size, 8, textW, 1);
      y += size * 1.2;
      boxes.push({ t: "text", x: xFor(m.width(l.lines[0], BB, l.size), textX, textW), y, size: l.size, font: BB, color: ink ? "#000000" : s.accent, text: l.lines[0] });
      y += mm(1.5);
    }
    const size = (b.mode === "match" ? 28 : 30) * scale;
    const t = fitText(m, b.title, H, size, 18, textW, 2);
    if (!t.fits) issues.push({ level: "warning", message: "De kop is te lang en wordt afgekort.", format: "a4", field: "match.title" });
    const titleTop = y;
    for (const l of t.lines) {
      y += t.size * 1.08;
      boxes.push({ t: "text", x: xFor(m.width(l, H, t.size), textX, textW), y, size: t.size, font: H, color: text, text: l });
    }
    if (b.cancelled) {
      y += 13 * scale * 1.3;
      boxes.push({ t: "text", x: textX, y, size: 13 * scale, font: BB, color: ink ? "#000000" : "#B91C1C", text: m.clean("Afgelast", BB) });
    }
    y += mm(1.5);
    const ls = 12.5 * scale;
    for (const line of b.lines) {
      for (const l of wrap(m, line, B, ls, textW)) {
        y += ls * 1.3;
        boxes.push({ t: "text", x: xFor(m.width(l, B, ls), textX, textW), y, size: ls, font: B, color: muted, text: l });
      }
    }
    if (hasLogos) {
      const mid = titleTop + Math.max(logo, y - titleTop) / 2 - logo / 2;
      if (b.homeLogo) boxes.push(fitImage(b.homeLogo, left, mid, logo, logo));
      if (b.awayLogo) boxes.push(fitImage(b.awayLogo, left + cw - logo, mid, logo, logo));
      y = Math.max(y, mid + logo);
    }
    return y + mm(1);
  }

  function fitImage(a: AssetRef, x: number, y0: number, w: number, h: number): A4Box {
    const r = a.width / a.height;
    let dw = w;
    let dh = w / r;
    if (dh > h) {
      dh = h;
      dw = h * r;
    }
    return { t: "image", x: x + (w - dw) / 2, y: y0 + (h - dh) / 2, w: dw, h: dh, asset: a };
  }

  function typeBlock(b: Extract<ViewBlock, { id: "type" }>, x0: number, w: number, y0: number): number {
    let y = y0;
    const size = 12 * scale;
    const label = fitText(m, b.label.toUpperCase(), BB, size, 9, w - mm(8), 1).lines[0];
    const bw = Math.min(w, m.width(label, BB, size) + mm(8));
    const bh = size + mm(4);
    const fill = view.style.typeAccent;
    const onFill = contrastText(fill);
    if (!ink) boxes.push({ t: "rect", x: x0, y, w: bw, h: bh, fill, radius: Math.min(radius, 6) });
    else boxes.push({ t: "rect", x: x0, y, w: bw, h: bh, stroke: "#000000", strokeWidth: 1.2, radius: Math.min(radius, 6) });
    boxes.push({ t: "text", x: x0 + mm(4), y: y + bh / 2 + size * 0.35, size, font: BB, color: ink ? "#000000" : onFill, text: label });
    y += bh;
    if (b.explanation) {
      const es = 10 * scale;
      y += mm(1.5);
      for (const l of wrap(m, b.explanation, B, es, w).slice(0, 4)) {
        y += es * s.lineHeight;
        boxes.push({ t: "text", x: x0, y, size: es, font: B, color: muted, text: l });
      }
    }
    return y;
  }

  function holder(b: Extract<ViewBlock, { id: "holder" }>, x0: number, w: number, y0: number): number {
    let y = y0;
    if (b.label) {
      const ls = 9 * scale;
      y += ls * 1.2;
      boxes.push({ t: "text", x: x0, y, size: ls, font: BB, color: muted, text: m.clean(b.label.toUpperCase(), BB) });
      y += mm(1);
    }
    const ns = 20 * scale;
    const n = fitText(m, b.name, H, ns, 14, w, 2);
    for (const l of n.lines) {
      y += n.size * 1.1;
      boxes.push({ t: "text", x: x0, y, size: n.size, font: H, color: text, text: l });
    }
    if (b.company) {
      const cs = 11 * scale;
      for (const l of wrap(m, b.company, B, cs, w).slice(0, 2)) {
        y += cs * 1.3;
        boxes.push({ t: "text", x: x0, y, size: cs, font: B, color: muted, text: l });
      }
    }
    return y;
  }

  function access(b: Extract<ViewBlock, { id: "access" }>, x0: number, w: number, y0: number): number {
    const y = y0;
    const colW = w / Math.max(1, b.items.length);
    let maxY = y;
    b.items.forEach((it, i) => {
      let iy = y;
      const x = x0 + i * colW;
      iy += 9 * scale * 1.2;
      boxes.push({ t: "text", x, y: iy, size: 9 * scale, font: BB, color: muted, text: m.clean(it.label.toUpperCase(), BB) });
      const vs = 14 * scale;
      for (const l of wrap(m, it.value, H, vs, colW - mm(3)).slice(0, 2)) {
        iy += vs * 1.15;
        boxes.push({ t: "text", x, y: iy, size: vs, font: H, color: text, text: l });
      }
      maxY = Math.max(maxY, iy);
    });
    return maxY;
  }

  function qrBox(b: Extract<ViewBlock, { id: "qr" }>, x0: number, y0: number, size: number, w: number): number {
    // Wit vlak met een stille zone van minstens 4 modules (de qr-tekenaar laat de rand vrij).
    const pad = Math.max(mm(4), (size / qrMatrix(b.code).size) * 4);
    const box = size + 2 * pad;
    const bx = x0 + (w - box) / 2;
    boxes.push({ t: "rect", x: bx, y: y0, w: box, h: box, fill: "#FFFFFF", stroke: ink ? "#000000" : s.accent, strokeWidth: ink ? 0.8 : 2, radius: Math.min(radius, 8) });
    boxes.push({ t: "qr", x: bx + pad, y: y0 + pad, size, code: b.code });
    let y = y0 + box;
    if (b.caption) {
      const cs = 9.5 * scale;
      for (const l of wrap(m, b.caption, B, cs, w)) {
        y += cs * 1.35;
        boxes.push({ t: "text", x: x0 + (w - m.width(l, B, cs)) / 2, y, size: cs, font: B, color: muted, text: l });
      }
    }
    if (b.sample) {
      const ss = 8.5;
      y += ss * 1.5;
      const l = m.clean("Testcode – geeft geen toegang", BB);
      boxes.push({ t: "text", x: x0 + (w - m.width(l, BB, ss)) / 2, y, size: ss, font: BB, color: "#B91C1C", text: l });
    }
    return y;
  }

  function qrStack(b: Extract<ViewBlock, { id: "qr" }>, y0: number): number {
    return qrBox(b, left, y0, mm(view.a4.qrSize), cw);
  }

  function panel(y0: number): number {
    const qr = view.blocks.find((b) => b.id === "qr") as Extract<ViewBlock, { id: "qr" }>;
    const pad = mm(6);
    const qrSize = mm(view.a4.qrSize);
    const rightW = qrSize + 2 * Math.max(mm(4), (qrSize / qrMatrix(qr.code).size) * 4) + mm(4);
    const leftW = cw - rightW - 2 * pad - mm(6);
    const rightX = view.a4.qrPosition === "right" ? left + cw - pad - rightW : left + pad;
    const leftX = view.a4.qrPosition === "right" ? left + pad : left + pad + rightW + mm(6);
    const startIdx = boxes.length;
    let ly = y0 + pad;
    const order = view.blocks.filter((b) => b.id === "type" || b.id === "holder" || b.id === "access");
    order.forEach((b, i) => {
      if (i > 0) ly += mm(5);
      if (b.id === "type") ly = typeBlock(b, leftX, leftW, ly);
      if (b.id === "holder") ly = holder(b, leftX, leftW, ly);
      if (b.id === "access") ly = access(b, leftX, leftW, ly);
    });
    const ry = qrBox(qr, rightX, y0 + pad, qrSize, rightW);
    const h = Math.max(ly, ry) - y0 + pad;
    const frame: A4Box = s.border || ink ? { t: "rect", x: left, y: y0, w: cw, h, fill: ink ? undefined : s.background, stroke: ink ? "#000000" : tint(s.text, 0.18), strokeWidth: 0.8, radius } : { t: "rect", x: left, y: y0, w: cw, h, fill: s.background, radius };
    boxes.splice(startIdx, 0, frame);
    return y0 + h;
  }

  function message(b: Extract<ViewBlock, { id: "message" }>, y0: number): number {
    const pad = mm(4);
    const size = 12 * scale;
    const lines = wrap(m, b.text, BB, size, cw - 2 * pad).slice(0, 4);
    const h = lines.length * size * 1.35 + 2 * pad;
    const accent = b.tone === "accent" && !ink;
    boxes.push({ t: "rect", x: left, y: y0, w: cw, h, fill: accent ? s.accent : ink ? undefined : tint(s.text, 0.06), stroke: ink ? "#000000" : undefined, strokeWidth: ink ? 1 : undefined, radius });
    let y = y0 + pad;
    for (const l of lines) {
      y += size * 1.35;
      boxes.push({ t: "text", x: xFor(m.width(l, BB, size), left + pad, cw - 2 * pad), y: y - size * 0.3, size, font: BB, color: accent ? s.onAccent : text, text: l });
    }
    return y0 + h;
  }

  function info(b: Extract<ViewBlock, { id: "info" }>, y0: number): number {
    let y = y0;
    if (b.title) {
      const ts = 13 * scale;
      y += ts * 1.2;
      boxes.push({ t: "text", x: left, y, size: ts, font: H, color: text, text: m.clean(b.title, H) });
      y += mm(2);
    }
    const n = b.items.length;
    const colGap = mm(6);
    const colW = (cw - colGap * (n - 1)) / n;
    const fs = 9.5 * scale;
    let maxY = y;
    b.items.forEach((it, i) => {
      const x = left + i * (colW + colGap);
      let iy = y + fs * 1.2;
      boxes.push({ t: "text", x, y: iy, size: fs, font: BB, color: text, text: m.clean(it.label, BB) });
      const lines = wrap(m, it.text, B, fs, colW);
      const kept = o.trimInfo ? lines.slice(0, 4) : lines;
      for (const l of kept) {
        iy += fs * s.lineHeight;
        boxes.push({ t: "text", x, y: iy, size: fs, font: B, color: muted, text: l });
      }
      maxY = Math.max(maxY, iy);
    });
    return maxY;
  }

  function extra(b: Extract<ViewBlock, { id: "extra" }>, y0: number): number {
    let y = y0;
    if (b.title) {
      const ts = 13 * scale;
      y += ts * 1.2;
      boxes.push({ t: "text", x: left, y, size: ts, font: H, color: text, text: m.clean(b.title, H) });
      y += mm(1.5);
    }
    const fs = 10 * scale;
    for (const l of wrap(m, b.text, B, fs, cw)) {
      y += fs * s.lineHeight;
      boxes.push({ t: "text", x: left, y, size: fs, font: B, color: muted, text: l });
    }
    return y;
  }

  function sponsors(b: Extract<ViewBlock, { id: "sponsors" }>, y0: number): number {
    let y = y0;
    if (b.title) {
      const ts = 9 * scale;
      y += ts * 1.2;
      const t = m.clean(b.title.toUpperCase(), BB);
      boxes.push({ t: "text", x: b.align === "center" ? left + (cw - m.width(t, BB, ts)) / 2 : left, y, size: ts, font: BB, color: muted, text: t });
      y += mm(2.5);
    }
    const sizeStep = o.smallSponsors ? "s" : b.size;
    const h = mm(sizeStep === "s" ? 11 : sizeStep === "l" ? 20 : 15);
    const gapX = mm(7);
    const maxW = h * 3.2;
    const widths = b.logos.map((l) => Math.min(maxW, (l.width / l.height) * h));
    const rows: number[][] = [[]];
    let rowW = 0;
    widths.forEach((w, i) => {
      if (rows[rows.length - 1].length && rowW + gapX + w > cw) {
        rows.push([]);
        rowW = 0;
      }
      rows[rows.length - 1].push(i);
      rowW += (rowW ? gapX : 0) + w;
    });
    for (const row of rows) {
      const total = row.reduce((n, i) => n + widths[i], 0) + gapX * (row.length - 1);
      let x = b.align === "center" ? left + (cw - total) / 2 : left;
      for (const i of row) {
        boxes.push(fitImage(b.logos[i], x, y, widths[i], h));
        x += widths[i] + gapX;
      }
      y += h + mm(3);
    }
    return y - mm(3);
  }

  function contrastText(hex: string): string {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return l > 0.179 ? "#000000" : "#FFFFFF";
  }
}
