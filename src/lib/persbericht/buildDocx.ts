import fs from "node:fs/promises";
import path from "node:path";
import {
  Document,
  Paragraph,
  TextRun,
  Tab,
  Header,
  ImageRun,
  AlignmentType,
  BorderStyle,
  TabStopType,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  TextWrappingType,
  Packer,
} from "docx";
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
  FONT_FAMILY,
  MASTHEAD_SIZE_PT,
  TITLE_SIZE_PT,
  BODY_SIZE_PT,
  RULE_COLOR,
} from "./layout";

export interface PersberichtData {
  title: string;
  date: Date;
  lead: string;
  body: string;
}

const pt2twip = (pt: number) => Math.round(pt * 20);
const pt2half = (pt: number) => Math.round(pt * 2);
const pt2px = (pt: number) => Math.round((pt * 96) / 72);

async function loadImage(relPath: string): Promise<Buffer> {
  return fs.readFile(path.join(process.cwd(), relPath));
}

function floatingHeaderImage(buffer: Buffer) {
  return new ImageRun({
    type: "png",
    data: buffer,
    transformation: { width: pt2px(HEADER_IMAGE_WIDTH_PT), height: pt2px(HEADER_IMAGE_HEIGHT_PT) },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
      wrap: { type: TextWrappingType.NONE },
      allowOverlap: true,
    },
  });
}

const rule = {
  bottom: { style: BorderStyle.SINGLE, size: 4, space: 1, color: RULE_COLOR },
} as const;

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(date)
    .replace(/\//g, "-");
}

/**
 * Bouwt een .docx die exact de opmaak van HHC's eigen persbericht-sjabloon
 * volgt (zie src/lib/persbericht/layout.ts) — briefhoofd met logo/adres/
 * sponsors op de eerste pagina, alleen het logo op eventuele
 * vervolgpagina's, "PERSBERICHT" + datum met een liniaal eronder, vetgedrukte
 * titel en inleiding, en de overige alinea's daaronder tot een afsluitende
 * liniaal.
 */
export async function buildPersberichtDocx(data: PersberichtData): Promise<Buffer> {
  const [firstHeaderBuf, continuationHeaderBuf] = await Promise.all([
    loadImage(HEADER_FIRST_PAGE_PATH),
    loadImage(HEADER_CONTINUATION_PATH),
  ]);

  const contentWidthTwip = pt2twip(PAGE_WIDTH_PT - MARGIN_LEFT_PT - MARGIN_RIGHT_PT);
  const bodyParagraphs = data.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const children: Paragraph[] = [
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: contentWidthTwip }],
      children: [
        new TextRun({ text: "PERSBERICHT", bold: true, font: FONT_FAMILY, size: pt2half(MASTHEAD_SIZE_PT) }),
        new TextRun({ children: [new Tab()], bold: true, font: FONT_FAMILY, size: pt2half(MASTHEAD_SIZE_PT) }),
        new TextRun({ text: formatDate(data.date), bold: true, font: FONT_FAMILY, size: pt2half(MASTHEAD_SIZE_PT) }),
      ],
    }),
    new Paragraph({ border: rule, children: [] }),
    new Paragraph({ children: [] }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [new TextRun({ text: data.title, bold: true, font: FONT_FAMILY, size: pt2half(TITLE_SIZE_PT) })],
    }),
    new Paragraph({ children: [] }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [new TextRun({ text: data.lead, bold: true, font: FONT_FAMILY, size: pt2half(BODY_SIZE_PT) })],
    }),
    new Paragraph({ children: [] }),
  ];

  for (const paragraphText of bodyParagraphs) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: paragraphText, font: FONT_FAMILY, size: pt2half(BODY_SIZE_PT) })],
      }),
      new Paragraph({ children: [] })
    );
  }
  // De laatste lege alinea sluit de sectie af met een liniaal.
  children[children.length - 1] = new Paragraph({ border: rule, children: [] });

  const doc = new Document({
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size: { width: pt2twip(PAGE_WIDTH_PT), height: pt2twip(PAGE_HEIGHT_PT) },
            margin: {
              top: pt2twip(MARGIN_TOP_PT),
              right: pt2twip(MARGIN_RIGHT_PT),
              bottom: pt2twip(MARGIN_BOTTOM_PT),
              left: pt2twip(MARGIN_LEFT_PT),
              header: pt2twip(20),
              footer: pt2twip(10),
            },
          },
        },
        headers: {
          first: new Header({ children: [new Paragraph({ children: [floatingHeaderImage(firstHeaderBuf)] })] }),
          default: new Header({ children: [new Paragraph({ children: [floatingHeaderImage(continuationHeaderBuf)] })] }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
