import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  PAGE_WIDTH_PT,
  PAGE_HEIGHT_PT,
  MARGIN_TOP_PT,
  MARGIN_RIGHT_PT,
  MARGIN_BOTTOM_PT,
  MARGIN_LEFT_PT,
  LINE_HEIGHT_RATIO,
  HEADER_IMAGE_WIDTH_PT,
  HEADER_IMAGE_HEIGHT_PT,
  HEADER_FIRST_PAGE_PATH,
  HEADER_CONTINUATION_PATH,
  PDF_FONT_REGULAR_PATH,
  PDF_FONT_BOLD_PATH,
  MASTHEAD_SIZE_PT,
  TITLE_SIZE_PT,
  TITLE_SPACER_SIZE_PT,
  BODY_SIZE_PT,
  RULE_TO_TITLE_GAP_PT,
} from "./layout";

export interface PersberichtData {
  title: string;
  date: Date;
  lead: string;
  body: string;
}

async function loadFile(relPath: string): Promise<Buffer> {
  return fs.readFile(path.join(process.cwd(), relPath));
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(date)
    .replace(/\//g, "-");
}

function normalizeLine(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map(normalizeLine)
    .filter(Boolean);
}

// Simpel woordafbreek-algoritme: knipt tekst in regels die binnen maxWidth passen.
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(test, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Eén paragraaf uit de "flow" die de PDF-export rendert — dezelfde
 * volgorde/opmaak als de paragrafen in het Word-referentiedocument (zie
 * buildDocx.ts), zodat Word- en PDF-uitvoer zo dicht mogelijk bij elkaar
 * blijven zonder dat de absolute posities hard gecodeerd hoeven te worden:
 * alles wordt van bovenaf opgebouwd, regel voor regel, zoals Word dat ook
 * doet.
 */
type FlowParagraph =
  | { kind: "masthead"; date: Date }
  | { kind: "blank"; size: number; ruleAfter: boolean; lineHeightPt?: number }
  | { kind: "text"; text: string; bold: boolean; size: number; justify: boolean; ruleAfter: boolean };

function ruleAfterOf(item: FlowParagraph): boolean {
  return item.kind !== "masthead" && item.ruleAfter;
}

function buildFlow(data: PersberichtData, titleFont: PDFFont): FlowParagraph[] {
  const bodyParagraphs = splitParagraphs(data.body);
  const bodyFlow: FlowParagraph[] =
    bodyParagraphs.length > 0
      ? bodyParagraphs.flatMap((text) => [
          { kind: "text" as const, text, bold: false, size: BODY_SIZE_PT, justify: true, ruleAfter: true },
          { kind: "blank" as const, size: BODY_SIZE_PT, ruleAfter: true },
        ])
      : [{ kind: "blank" as const, size: BODY_SIZE_PT, ruleAfter: true }];

  // RULE_TO_TITLE_GAP_PT is de gewenste ZICHTBARE witruimte tussen de
  // onderkant van de liniaal en de bovenkant van de titelletters. drawText
  // plaatst echter de basislijn, niet de bovenkant van de glyph — dus moet
  // de regelhoogte van deze positioneringsalinea ook de ascent (hoogte
  // boven de basislijn) van de titel-lettergrootte zelf bevatten, anders
  // "eet" de titeltekst een stuk van de bedoelde witruimte op.
  const titleAscentPt = titleFont.heightAtSize(TITLE_SIZE_PT, { descender: false });

  return [
    { kind: "blank", size: BODY_SIZE_PT, ruleAfter: false },
    { kind: "blank", size: BODY_SIZE_PT, ruleAfter: false },
    { kind: "blank", size: MASTHEAD_SIZE_PT, ruleAfter: false },
    { kind: "masthead", date: data.date },
    { kind: "blank", size: BODY_SIZE_PT, ruleAfter: true },
    { kind: "blank", size: BODY_SIZE_PT, ruleAfter: false, lineHeightPt: RULE_TO_TITLE_GAP_PT + titleAscentPt },
    { kind: "text", text: normalizeLine(data.title), bold: true, size: TITLE_SIZE_PT, justify: true, ruleAfter: true },
    { kind: "blank", size: TITLE_SPACER_SIZE_PT, ruleAfter: true },
    { kind: "text", text: normalizeLine(data.lead), bold: true, size: BODY_SIZE_PT, justify: true, ruleAfter: true },
    { kind: "blank", size: BODY_SIZE_PT, ruleAfter: true },
    ...bodyFlow,
    { kind: "blank", size: BODY_SIZE_PT, ruleAfter: false },
    { kind: "blank", size: BODY_SIZE_PT, ruleAfter: false },
  ];
}

/**
 * Bouwt een PDF die dezelfde paragraafvolgorde en -opmaak volgt als het
 * Word-referentiedocument (zie buildFlow hierboven en buildDocx.ts),
 * regel voor regel van bovenaf opgebouwd zoals Word dat zelf ook doet, in
 * plaats van vaste, los gemeten posities. pdf-lib rendert zelf geen
 * tekstopmaak/regelafbreking, dus die logica (uitvloeien, uitvullen,
 * paginawissels) staat hieronder handmatig.
 *
 * Het lettertype is een vervanger (zie layout.ts) zolang er geen
 * herdistribueerbaar Verdana-bestand beschikbaar is — de Word-export heeft
 * dit probleem niet, want die verwijst alleen naar het lokaal
 * geïnstalleerde lettertype.
 */
export async function buildPersberichtPdf(data: PersberichtData): Promise<Buffer> {
  const [firstHeaderBytes, contHeaderBytes, regularFontBytes, boldFontBytes] = await Promise.all([
    loadFile(HEADER_FIRST_PAGE_PATH),
    loadFile(HEADER_CONTINUATION_PATH),
    loadFile(PDF_FONT_REGULAR_PATH),
    loadFile(PDF_FONT_BOLD_PATH),
  ]);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const regularFont = await pdfDoc.embedFont(regularFontBytes, { subset: true });
  const boldFont = await pdfDoc.embedFont(boldFontBytes, { subset: true });
  const firstHeaderImage = await pdfDoc.embedPng(firstHeaderBytes);
  const contHeaderImage = await pdfDoc.embedPng(contHeaderBytes);

  const contentLeft = MARGIN_LEFT_PT;
  const contentRight = PAGE_WIDTH_PT - MARGIN_RIGHT_PT;
  const contentWidth = contentRight - contentLeft;
  const black = rgb(0, 0, 0);

  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
  let y = PAGE_HEIGHT_PT - MARGIN_TOP_PT;

  function drawHeader(pg: PDFPage, isFirst: boolean) {
    const img = isFirst ? firstHeaderImage : contHeaderImage;
    pg.drawImage(img, {
      x: 0,
      y: PAGE_HEIGHT_PT - HEADER_IMAGE_HEIGHT_PT,
      width: HEADER_IMAGE_WIDTH_PT,
      height: HEADER_IMAGE_HEIGHT_PT,
    });
  }
  drawHeader(page, true);

  function newPage() {
    page = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
    drawHeader(page, false);
    y = PAGE_HEIGHT_PT - MARGIN_TOP_PT;
  }

  function ensureSpace(lineHeight: number) {
    if (y - lineHeight < MARGIN_BOTTOM_PT) newPage();
  }

  function drawRuleAt(ruleY: number) {
    page.drawLine({ start: { x: contentLeft, y: ruleY }, end: { x: contentRight, y: ruleY }, thickness: 0.75, color: black });
  }

  function drawJustifiedLine(line: string, font: PDFFont, size: number, isLast: boolean) {
    if (!isLast) {
      const words = line.split(" ");
      if (words.length > 1) {
        const textWidth = font.widthOfTextAtSize(line, size);
        const spaceWidth = font.widthOfTextAtSize(" ", size);
        const extraPerGap = Math.max(0, (contentWidth - textWidth) / (words.length - 1));
        let cursorX = contentLeft;
        for (const word of words) {
          page.drawText(word, { x: cursorX, y, size, font, color: black });
          cursorX += font.widthOfTextAtSize(word, size) + spaceWidth + extraPerGap;
        }
        return;
      }
    }
    page.drawText(line, { x: contentLeft, y, size, font, color: black });
  }

  const flow = buildFlow(data, boldFont);
  for (let i = 0; i < flow.length; i++) {
    const item = flow[i];
    const lineHeight =
      item.kind === "masthead"
        ? MASTHEAD_SIZE_PT * LINE_HEIGHT_RATIO
        : item.kind === "blank" && item.lineHeightPt !== undefined
          ? item.lineHeightPt
          : item.size * LINE_HEIGHT_RATIO;

    if (item.kind === "masthead") {
      ensureSpace(lineHeight);
      page.drawText("PERSBERICHT", { x: contentLeft, y, size: MASTHEAD_SIZE_PT, font: boldFont, color: black });
      const dateStr = formatDate(item.date);
      const dateWidth = boldFont.widthOfTextAtSize(dateStr, MASTHEAD_SIZE_PT);
      page.drawText(dateStr, { x: contentRight - dateWidth, y, size: MASTHEAD_SIZE_PT, font: boldFont, color: black });
      y -= lineHeight;
    } else if (item.kind === "blank") {
      ensureSpace(lineHeight);
      y -= lineHeight;
    } else {
      const font = item.bold ? boldFont : regularFont;
      const lines = item.text ? wrapText(item.text, font, item.size, contentWidth) : [""];
      lines.forEach((line, lineIndex) => {
        ensureSpace(lineHeight);
        const isLast = lineIndex === lines.length - 1;
        if (item.justify) {
          drawJustifiedLine(line, font, item.size, isLast);
        } else {
          page.drawText(line, { x: contentLeft, y, size: item.size, font, color: black });
        }
        y -= lineHeight;
      });
    }

    // Net als in het Word-document (pBdr op opeenvolgende paragrafen):
    // de liniaal verschijnt pas na de LAATSTE paragraaf van een
    // aaneengesloten reeks met ruleAfter — niet na elke paragraaf apart.
    const nextRuleAfter = i + 1 < flow.length && ruleAfterOf(flow[i + 1]);
    if (ruleAfterOf(item) && !nextRuleAfter) {
      drawRuleAt(y);
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
