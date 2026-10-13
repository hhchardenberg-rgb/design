import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  PAGE_WIDTH_PT, PAGE_HEIGHT_PT, MARGIN_LEFT_PT, MARGIN_RIGHT_PT, MARGIN_BOTTOM_PT, HEADER_IMAGE_WIDTH_PT, HEADER_IMAGE_HEIGHT_PT,
  HEADER_FIRST_PAGE_PATH, HEADER_CONTINUATION_PATH, PDF_FONT_REGULAR_PATH, PDF_FONT_BOLD_PATH, LINE_HEIGHT_RATIO,
} from "@/lib/persbericht/layout";
import { totalsOf } from "./invoice-math";

// Factuur/creditnota als pdf op het briefpapier van het persbericht (dezelfde headerafbeeldingen en het
// zelfde lettertype). Het briefhoofd beslaat de bovenste 127 pt van elke pagina.

export interface PdfDocData {
  kind: "INVOICE" | "CREDIT_NOTE";
  number: string;
  issuedOn: string;
  dueOn: string | null;
  deliveryText: string | null;
  reference: string | null;
  creditedNumber: string | null;
  buyerName: string;
  buyerAddress: string | null;
  buyerVatNumber: string | null;
  supplier: { legalName: string | null; street: string | null; postalCode: string | null; city: string | null; kvkNumber: string | null; vatNumber: string | null; iban: string | null };
  lines: { description: string; quantity: number; unitCents: number; vatRateBp: number | null }[];
}

async function loadFile(rel: string): Promise<Buffer> {
  return fs.readFile(path.join(process.cwd(), "public", rel.replace(/^public\//, "")));
}

const euro = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
const day = (iso: string) => iso.split("-").reverse().join("-");

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) cur = next;
      else { if (cur) out.push(cur); cur = w; }
    }
    out.push(cur);
  }
  return out;
}

export async function buildInvoicePdf(d: PdfDocData): Promise<Buffer> {
  const [h1, h2, reg, bold] = await Promise.all([loadFile(HEADER_FIRST_PAGE_PATH), loadFile(HEADER_CONTINUATION_PATH), loadFile(PDF_FONT_REGULAR_PATH), loadFile(PDF_FONT_BOLD_PATH)]);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(reg, { subset: true });
  const fontBold = await pdf.embedFont(bold, { subset: true });
  const img1 = await pdf.embedPng(h1);
  const img2 = await pdf.embedPng(h2);
  const black = rgb(0, 0, 0);
  const left = MARGIN_LEFT_PT;
  const right = PAGE_WIDTH_PT - MARGIN_RIGHT_PT;
  const width = right - left;
  const size = 9.5;
  const lh = size * LINE_HEIGHT_RATIO;

  let page: PDFPage;
  let y = 0;
  function newPage(first: boolean) {
    page = pdf.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
    page.drawImage(first ? img1 : img2, { x: 0, y: PAGE_HEIGHT_PT - HEADER_IMAGE_HEIGHT_PT, width: HEADER_IMAGE_WIDTH_PT, height: HEADER_IMAGE_HEIGHT_PT });
    y = PAGE_HEIGHT_PT - HEADER_IMAGE_HEIGHT_PT - 24;
  }
  const ensure = (h: number) => { if (y - h < MARGIN_BOTTOM_PT + 30) newPage(false); };
  const text = (t: string, x: number, f = font, s = size) => page.drawText(t, { x, y, size: s, font: f, color: black });
  const textRight = (t: string, xr: number, f = font, s = size) => page.drawText(t, { x: xr - f.widthOfTextAtSize(t, s), y, size: s, font: f, color: black });

  newPage(true);
  const credit = d.kind === "CREDIT_NOTE";
  text(credit ? "CREDITNOTA" : "FACTUUR", left, fontBold, 18);
  y -= 26;

  // Afnemer links, documentgegevens rechts.
  const buyer = [d.buyerName, ...(d.buyerAddress ? d.buyerAddress.split("\n") : []), ...(d.buyerVatNumber ? [`Btw-nummer: ${d.buyerVatNumber}`] : [])];
  const meta: [string, string][] = [
    [credit ? "Creditnotanummer" : "Factuurnummer", d.number],
    [credit ? "Creditnotadatum" : "Factuurdatum", day(d.issuedOn)],
    ...(d.dueOn ? [["Uiterste betaaldatum", day(d.dueOn)] as [string, string]] : []),
    ...(d.creditedNumber ? [["Betreft factuur", d.creditedNumber] as [string, string]] : []),
    ...(d.deliveryText ? [[credit ? "Betreft levering" : "Levering", d.deliveryText] as [string, string]] : []),
    ...(d.reference ? [["Uw referentie", d.reference] as [string, string]] : []),
  ];
  const top = y;
  buyer.forEach((l, i) => { text(l, left, i === 0 ? fontBold : font); y -= lh; });
  const afterBuyer = y;
  y = top;
  const metaX = left + width * 0.5;
  for (const [k, v] of meta) {
    const lines = wrap(v, font, size, right - (metaX + 110));
    text(k, metaX, fontBold);
    lines.forEach((l) => { text(l, metaX + 110); y -= lh; });
  }
  y = Math.min(y, afterBuyer) - 18;

  // Regels.
  const colQty = left + width * 0.58, colUnit = left + width * 0.74, colVat = left + width * 0.8, colTotal = right;
  text("Omschrijving", left, fontBold); text("Aantal", colQty, fontBold); textRight("Prijs", colUnit + 30, fontBold); textRight("Btw", colVat + 30, fontBold); textRight("Bedrag", colTotal, fontBold);
  y -= 4;
  page!.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: black });
  y -= lh;
  const sign = credit ? -1 : 1;
  for (const l of d.lines) {
    const desc = wrap(l.description, font, size, colQty - left - 8);
    ensure(desc.length * lh);
    desc.forEach((line, i) => {
      text(line, left);
      if (i === 0) {
        text(String(l.quantity), colQty);
        textRight(euro(l.unitCents), colUnit + 30);
        textRight(l.vatRateBp == null ? "" : `${l.vatRateBp / 100}%`, colVat + 30);
        textRight(euro(sign * l.quantity * l.unitCents), colTotal);
      }
      y -= lh;
    });
  }
  page!.drawLine({ start: { x: left, y: y + lh - 4 }, end: { x: right, y: y + lh - 4 }, thickness: 0.5, color: black });

  // Totalen per btw-tarief.
  const t = totalsOf(d.lines);
  ensure(lh * (3 + t.groups.length * 2));
  y -= 4;
  const label = right - 170;
  text("Totaal exclusief btw", label); textRight(euro(sign * t.netCents), right); y -= lh;
  for (const g of t.groups) {
    text(`Btw ${g.vatRateBp / 100}% over ${euro(sign * g.netCents)}`, label); textRight(euro(sign * g.vatCents), right); y -= lh;
  }
  text(credit ? "Totaal te crediteren" : "Totaal te betalen", label, fontBold); textRight(euro(sign * t.grossCents), right, fontBold); y -= lh * 2;

  // Betaalinstructie of toelichting.
  const note = credit
    ? `Deze creditnota corrigeert factuur ${d.creditedNumber ?? ""}. Het bedrag wordt verrekend of teruggestort.`
    : `Wij verzoeken u het bedrag vóór ${d.dueOn ? day(d.dueOn) : "de vervaldatum"} over te maken op ${d.supplier.iban ?? ""} ten name van ${d.supplier.legalName ?? ""}, onder vermelding van factuurnummer ${d.number}.`;
  for (const line of wrap(note, font, size, width)) { ensure(lh); text(line, left); y -= lh; }

  // Gegevens van de vereniging onderaan elke pagina met inhoud (laatste pagina).
  const s = d.supplier;
  const foot = [s.legalName, [s.street, [s.postalCode, s.city].filter(Boolean).join(" ")].filter(Boolean).join(", "), `KvK ${s.kvkNumber ?? ""}`, `Btw-nr ${s.vatNumber ?? ""}`].filter(Boolean).join("  ·  ");
  y = MARGIN_BOTTOM_PT + 18;
  for (const line of wrap(foot, font, 8, width)) { text(line, left, font, 8); y -= 10; }

  return Buffer.from(await pdf.save());
}
