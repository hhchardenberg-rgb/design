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
  HEADER_IMAGE_WIDTH_PT,
  HEADER_IMAGE_HEIGHT_PT,
  HEADER_FIRST_PAGE_PATH,
  HEADER_CONTINUATION_PATH,
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
 */
export async function buildPersberichtPdf(data: PersberichtData): Promise<Buffer> {
  const [firstHeaderBytes, contHeaderBytes, regularFontBytes, boldFontBytes] = await Promise.all([
    loadFile(HEADER_FIRST_PAGE_PATH),
    loadFile(HEADER_CONTINUATION_PATH),
    loadFile("public/fonts/dejavu/DejaVuSans.ttf"),
    loadFile("public/fonts/dejavu/DejaVuSans-Bold.ttf"),
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

  function drawRule() {
    ensureSpace(4);
    page.drawLine({ start: { x: contentLeft, y }, end: { x: contentRight, y }, thickness: 0.75, color: black });
    y -= 10;
  }

  function blankLine(size = BODY_SIZE_PT) {
    y -= size * 1.25;
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
    const lineHeight = size * 1.25;
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
  ensureSpace(MASTHEAD_SIZE_PT * 1.25);
  page.drawText("PERSBERICHT", { x: contentLeft, y, size: MASTHEAD_SIZE_PT, font: boldFont, color: black });
  const dateStr = formatDate(data.date);
  const dateWidth = boldFont.widthOfTextAtSize(dateStr, MASTHEAD_SIZE_PT);
  page.drawText(dateStr, { x: contentRight - dateWidth, y, size: MASTHEAD_SIZE_PT, font: boldFont, color: black });
  y -= MASTHEAD_SIZE_PT * 1.25;

  drawRule();
  blankLine();

  drawParagraph(data.title, boldFont, TITLE_SIZE_PT, true);
  blankLine();

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

  drawRule();

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
