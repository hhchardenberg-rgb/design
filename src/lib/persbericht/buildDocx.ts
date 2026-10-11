import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

export interface PersberichtData {
  title: string;
  date: Date;
  lead: string;
  body: string;
}

/**
 * Bronbestand voor de Word-export: een echt HHC-persbericht (zie
 * seed-assets/persbericht/reference.docx), met het briefhoofd op de eerste
 * pagina vervangen door de actuele versie (sponsor "elis" i.p.v. "Moderna").
 * We bouwen de .docx NIET zelf op — dat bleek onbetrouwbaar (verkeerde
 * marges, verkeerd lettertype, header-structuur die niet overeenkwam met
 * een echt persbericht). In plaats daarvan kopiëren we dit bestand en
 * passen we alleen de variabele tekst aan, met behoud van de volledige
 * package-structuur (headers, footers, afbeeldingen, stijlen, sectie-
 * instellingen) — zie word/document.xml hieronder voor welke paragrafen dat
 * zijn.
 */
const TEMPLATE_PATH = "seed-assets/persbericht/reference.docx";

// w14:paraId-waarden van de paragrafen in het bronbestand die we nodig
// hebben — stabiel zolang reference.docx niet vervangen wordt (zie
// hierboven). Gevonden door het bestand te unzippen en word/document.xml te
// inspecteren; niet afgeleid van de voorbeeldtekst zelf, dus onafhankelijk
// van wat daar nu in staat.
const PARA_ID = {
  /** "PERSBERICHT" + tabs + datum, op dezelfde regel. */
  masthead: "4A841AE7",
  /** De titel-paragraaf (vet, uitgevuld, met de liniaal via pBdr). */
  title: "636E6ABC",
  /** De vetgedrukte eerste alinea. */
  lead: "71361E3A",
  /** Eerste "overige tekst"-paragraaf — clone-sjabloon voor elke alinea. */
  bodyTemplate: "5E861FE3",
  /** Lege scheidingsalinea na een "overige tekst"-paragraaf — clone-sjabloon. */
  spacerTemplate: "1DE30AF5",
  /**
   * Laatste paragraaf van het oorspronkelijke "overige tekst"-blok (nog met
   * de pBdr-rand die de onderste liniaal vormt). Samen met bodyTemplate
   * bepaalt dit het volledige te vervangen tekstbereik, ongeacht hoeveel
   * voorbeeldalinea's het bronbestand zelf bevat.
   */
  lastOriginalSpacer: "7F992620",
} as const;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Normaliseert tekst uit een formuliervfeld tot één regel zonder
 * handmatige regeleinden (die zouden in OOXML een <w:br/> vereisen om
 * zichtbaar te zijn — zonder dat valt een kale \n in <w:t> weg). Word
 * verzorgt zelf de regelafbreking binnen de paragraaf.
 */
function normalizeLine(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** Splitst "overige tekst" in alinea's op basis van lege regels. */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map(normalizeLine)
    .filter(Boolean);
}

interface ParagraphMatch {
  xml: string;
  start: number;
  end: number;
}

function findParagraphById(documentXml: string, paraId: string): ParagraphMatch {
  const re = new RegExp(`<w:p\\b[^>]*w14:paraId="${paraId}"[^>]*>[\\s\\S]*?</w:p>`);
  const match = re.exec(documentXml);
  if (!match) {
    throw new Error(`Persbericht-template: paragraaf met paraId ${paraId} niet gevonden in ${TEMPLATE_PATH}.`);
  }
  return { xml: match[0], start: match.index, end: match.index + match[0].length };
}

/** Vervangt de (enige) <w:t>-run-tekst in een geïsoleerde paragraaf-XML-string. */
function setParagraphText(paragraphXml: string, rawText: string): string {
  const escaped = xmlEscape(normalizeLine(rawText));
  return paragraphXml.replace(/<w:t[^>]*>[\s\S]*?<\/w:t>/, `<w:t xml:space="preserve">${escaped}</w:t>`);
}

let freshIdCounter = 0;
/** Genereert een nieuwe, unieke w14:paraId/textId-waarde (hex, 8 tekens). */
function freshRevisionId(): string {
  freshIdCounter += 1;
  return (0x20000000 + freshIdCounter).toString(16).toUpperCase().padStart(8, "0");
}

function withFreshRevisionIds(paragraphXml: string): string {
  return paragraphXml
    .replace(/w14:paraId="[0-9A-F]+"/, `w14:paraId="${freshRevisionId()}"`)
    .replace(/w14:textId="[0-9A-F]+"/, `w14:textId="${freshRevisionId()}"`);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(date)
    .replace(/\//g, "-");
}

/**
 * Bouwt een .docx door reference.docx te kopiëren en uitsluitend de
 * variabele tekst te vervangen — de volledige package-structuur (headers,
 * footers, afbeeldingen, stijlen, sectie-/paginainstellingen) blijft
 * ongewijzigd. Zie PARA_ID hierboven voor welke paragrafen worden
 * aangepast.
 */
export async function buildPersberichtDocx(data: PersberichtData): Promise<Buffer> {
  const templateBuffer = await fs.readFile(path.join(process.cwd(), TEMPLATE_PATH));
  const zip = await JSZip.loadAsync(templateBuffer);
  const documentXmlFile = zip.file("word/document.xml");
  if (!documentXmlFile) {
    throw new Error(`Persbericht-template: word/document.xml ontbreekt in ${TEMPLATE_PATH}.`);
  }
  let xml = await documentXmlFile.async("string");

  // 1. Datum: alleen de datumtekst binnen de masthead-paragraaf vervangen —
  //    "PERSBERICHT" en de tab-structuur die de datum rechts uitlijnt
  //    blijven exact staan.
  const masthead = findParagraphById(xml, PARA_ID.masthead);
  const newMasthead = masthead.xml.replace(/\d{2}-\d{2}-\d{4}/, formatDate(data.date));
  xml = xml.slice(0, masthead.start) + newMasthead + xml.slice(masthead.end);

  // 2. Titel.
  const titlePara = findParagraphById(xml, PARA_ID.title);
  const newTitlePara = setParagraphText(titlePara.xml, data.title);
  xml = xml.slice(0, titlePara.start) + newTitlePara + xml.slice(titlePara.end);

  // 3. Eerste alinea.
  const leadPara = findParagraphById(xml, PARA_ID.lead);
  const newLeadPara = setParagraphText(leadPara.xml, data.lead);
  xml = xml.slice(0, leadPara.start) + newLeadPara + xml.slice(leadPara.end);

  // 4. Overige tekst: voor elke alinea een kloon van de body-sjabloon-
  //    paragraaf (met de nieuwe tekst) gevolgd door een kloon van de lege
  //    scheidingsalinea — exact hetzelfde patroon als het bronbestand zelf
  //    gebruikt (body, spacer, body, spacer, ...). Het hele oorspronkelijke
  //    blok (van de eerste body-sjabloonparagraaf t/m de laatste
  //    scheidingsalinea met de pBdr-rand die de onderste liniaal vormt)
  //    wordt in één keer vervangen, zodat het aantal alinea's in het
  //    bronbestand er niet toe doet.
  const bodyTemplatePara = findParagraphById(xml, PARA_ID.bodyTemplate);
  const spacerTemplatePara = findParagraphById(xml, PARA_ID.spacerTemplate);
  const lastOriginalSpacer = findParagraphById(xml, PARA_ID.lastOriginalSpacer);

  const paragraphs = splitParagraphs(data.body);
  const bodyBlockXml =
    paragraphs.length > 0
      ? paragraphs
          .map((text) => withFreshRevisionIds(setParagraphText(bodyTemplatePara.xml, text)) + withFreshRevisionIds(spacerTemplatePara.xml))
          .join("")
      : withFreshRevisionIds(spacerTemplatePara.xml);

  xml = xml.slice(0, bodyTemplatePara.start) + bodyBlockXml + xml.slice(lastOriginalSpacer.end);

  zip.file("word/document.xml", xml);
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return buffer;
}
