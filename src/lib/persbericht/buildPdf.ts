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
  RULE_AFTER_MASTHEAD_TOP_PT,
  TITLE_TOP_PT,
  LEAD_TOP_PT,
  CONTINUATION_MARGIN_TOP_PT,
  LINE_HEIGHT_RATIO,
  HEADER_IMAGE_WIDTH_PT,
  HEADER_IMAGE_HEIGHT_PT,
  HEADER_FIRST_PAGE_PATH,
  HEADER_CONTINUATION_PATH,
  PDF_FONT_REGULAR_PATH,
  PDF_FONT_BOLD_PATH,
  MASTHEAD_SIZE_PT,
  TITLE_SIZE_PT,
  BODY_SIZE_PT,
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
 * Bouwt een PDF die dezelfde opmaak volgt als de .docx-export (zie
 * src/lib/persbericht/layout.ts voor de gedeelde maten). pdf-lib rendert
 * zelf geen tekstopmaak/regelafbreking, dus die logica (uitvloeien,
 * uitvullen, paginawissels) staat hieronder handmatig — bewust eenvoudig
 * gehouden en consistent met de docx-lay-out, niet met een losstaande
 * headless-browser-afhankelijkheid (past niet goed bij serverless).
 *
 * De positie van "PERSBERICHT", de liniaal eronder, de titel en de
 * inleiding staan op vaste, uit een echt voorbeeld gemeten hoogtes (zie
 * layout.ts) in plaats van opgeteld uit generieke regelafstanden — dat
 * bleek de enige manier om ze exact op dezelfde plek te krijgen als in het
 * origineel.
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
    y = PAGE_HEIGHT_PT - CONTINUATION_MARGIN_TOP_PT;
  }

  function ensureSpace(lineHeight: number) {
    if (y - lineHeight < MARGIN_BOTTOM_PT) newPage();
  }

  function drawRuleAt(ruleY: number) {
    page.drawLine({ start: { x: contentLeft, y: ruleY }, end: { x: contentRight, y: ruleY }, thickness: 0.75, color: black });
  }

  function blankLine(size = BODY_SIZE_PT) {
    y -= size * LINE_HEIGHT_RATIO;
  }

  function drawJustifiedLine(line: string, font: PDFFont, size: number) {
    const words = line.split(" ");
    if (words.length <= 1) {
      page.drawText(line, { x: contentLeft, y, size, font, color: black });
      return;
    }
    const textWidth = font.widthOfTextAtSize(line, size);
    const spaceWidth = font.widthOfTextAtSize(" ", size);
    const extraPerGap = Math.max(0, (contentWidth - textWidth) / (words.length - 1));
    let cursorX = contentLeft;
    for (const word of words) {
      page.drawText(word, { x: cursorX, y, size, font, color: black });
      cursorX += font.widthOfTextAtSize(word, size) + spaceWidth + extraPerGap;
    }
  }

  function drawParagraph(text: string, font: PDFFont, size: number, justify: boolean) {
    const lines = wrapText(text, font, size, contentWidth);
    const lineHeight = size * LINE_HEIGHT_RATIO;
    lines.forEach((line, i) => {
      ensureSpace(lineHeight);
      const isLast = i === lines.length - 1;
      if (justify && !isLast) {
        drawJustifiedLine(line, font, size);
      } else {
        page.drawText(line, { x: contentLeft, y, size, font, color: black });
      }
      y -= lineHeight;
    });
  }

  // Masthead: "PERSBERICHT" links, datum rechts uitgelijnd op dezelfde regel.
  page.drawText("PERSBERICHT", { x: contentLeft, y, size: MASTHEAD_SIZE_PT, font: boldFont, color: black });
  const dateStr = formatDate(data.date);
  const dateWidth = boldFont.widthOfTextAtSize(dateStr, MASTHEAD_SIZE_PT);
  page.drawText(dateStr, { x: contentRight - dateWidth, y, size: MASTHEAD_SIZE_PT, font: boldFont, color: black });

  // Liniaal, titel en inleiding staan op vaste, uit het voorbeeld gemeten
  // posities (masthead/liniaal/titel/inleiding passen altijd ruim op de
  // eerste pagina, dus een paginawissel speelt hier nooit mee).
  y = PAGE_HEIGHT_PT - RULE_AFTER_MASTHEAD_TOP_PT;
  drawRuleAt(y);

  y = PAGE_HEIGHT_PT - TITLE_TOP_PT;
  drawParagraph(data.title, boldFont, TITLE_SIZE_PT, true);

  // Bij een titel die over meerdere regels loopt, voorkomt dit dat de
  // inleiding erover/erdoorheen zou vallen — anders staat die exact op de
  // gemeten positie, zoals in het origineel.
  y = Math.min(y, PAGE_HEIGHT_PT - LEAD_TOP_PT);

  drawParagraph(data.lead, boldFont, BODY_SIZE_PT, true);
  blankLine();

  const bodyParagraphs = data.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const paragraph of bodyParagraphs) {
    drawParagraph(paragraph, regularFont, BODY_SIZE_PT, true);
    blankLine();
  }

  ensureSpace(4);
  drawRuleAt(y);

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
