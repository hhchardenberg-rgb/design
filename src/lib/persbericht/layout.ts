// Gedeelde lay-outwaarden voor de persbericht-generator, zodat de Word- en
// PDF-export (src/app/api/press-releases/[id]/docx en /pdf) dezelfde opmaak
// gebruiken. De marges/afmetingen zijn gebaseerd op het door HHC aangeleverde
// voorbeelddocument, maar MARGIN_TOP_PT is bijgesteld ten opzichte van de
// letterlijke OOXML-marge uit dat bestand: die waarde alleen gaf te weinig
// witruimte boven "PERSBERICHT" (de tekst overlapte zelfs het clublogo).
// Gekalibreerd door de output te vergelijken met een echt HHC-persbericht
// (Ben Scholte-voorbeeld) — wijzig deze waarde dus alleen na een vergelijking
// met een echt voorbeeld, niet als "verbetering" op gevoel.

// A4 in punten (1 punt = 1/72 inch; Word gebruikt twips = 1/20 punt).
export const PAGE_WIDTH_PT = 595;
export const PAGE_HEIGHT_PT = 842;

export const MARGIN_TOP_PT = 240;
export const MARGIN_RIGHT_PT = 53.85;
export const MARGIN_BOTTOM_PT = 12.2;
export const MARGIN_LEFT_PT = 77.95;

// De briefhoofdafbeelding beslaat de volle paginabreedte (bleed, geen
// marge) en is even hoog op elke pagina — op de eerste pagina de volledige
// balk (logo + adres + sponsors), op vervolgpagina's alleen het logo.
export const HEADER_IMAGE_WIDTH_PT = 595;
export const HEADER_IMAGE_HEIGHT_PT = 127;
export const HEADER_IMAGE_ASPECT = 2481 / 532; // breedte/hoogte van de bronafbeelding

export const HEADER_FIRST_PAGE_PATH = "public/branding/persbericht-header.png";
export const HEADER_CONTINUATION_PATH = "public/branding/persbericht-header-vervolg.png";

export const FONT_FAMILY = "Verdana";

export const MASTHEAD_SIZE_PT = 20; // "PERSBERICHT" + datum
export const TITLE_SIZE_PT = 15;
export const BODY_SIZE_PT = 12;

export const RULE_COLOR = "000000";
