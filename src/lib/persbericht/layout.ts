// Gedeelde lay-outwaarden voor de persbericht-generator.
//
// Deze waarden komen rechtstreeks uit de OOXML (word/document.xml,
// word/styles.xml, headerN.xml) van het echte HHC-referentiedocument dat nu
// als bronbestand dient voor de Word-export (zie buildDocx.ts en
// seed-assets/persbericht/reference.docx) — dus gemeten in het bronbestand
// zelf, niet geschat van een los PDF-voorbeeld. De PDF-export (buildPdf.ts)
// simuleert diezelfde paragraafvolgorde/-opmaak om zo dicht mogelijk bij de
// Word-uitvoer te komen zonder een los opmaak-systeem te verzinnen.
//
// LET OP — bekend verschil tussen de Word- en PDF-export: de Word-export
// verwijst naar het lettertype "Verdana" bij naam (zoals het bronbestand
// zelf doet); Word gebruikt dan het lokaal geïnstalleerde Verdana-lettertype
// en dat is dus altijd correct. Voor de PDF moet een lettertypebestand
// daadwerkelijk ingebed worden (een PDF-viewer doet geen fontsubstitutie
// zoals Word dat doet), en een echt, vrij herdistribueerbaar Verdana-
// bestand was niet beschikbaar — Microsoft's Verdana is geen open
// lettertype. De PDF gebruikt daarom DejaVu Sans als dichtstbijzijnde vrije
// vervanger (zie public/fonts/dejavu-sans/) totdat er een echt
// Verdana-bestand wordt aangeleverd (zelfde aanlevering als eerder bij de
// FF DIN-bestanden). Dit is een bewuste, hier gedocumenteerde afwijking —
// géén DIN, Arial, Calibri of ander willekeurig lettertype.

// A4 in punten (1 punt = 1/20 twip; Word gebruikt twips).
export const PAGE_WIDTH_PT = 595; // 11900 twips
export const PAGE_HEIGHT_PT = 842; // 16840 twips

// Paginamarges — rechtstreeks uit w:pgMar in het referentiedocument.
// Links en rechts zijn bewust aan elkaar gelijkgemaakt (anker: de
// bestaande linkermarge) nadat bleek dat de oorspronkelijke rechtermarge
// van het bronbestand de pagina visueel uit het midden trok.
export const MARGIN_TOP_PT = 120.5; // 2410 twips — alleen pagina 1 (zie CONTINUATION_MARGIN_TOP_PT)
export const MARGIN_LEFT_PT = 77.95; // 1559 twips
export const MARGIN_RIGHT_PT = 77.95; // 1559 twips (was 1077 — gelijkgemaakt aan links)
export const MARGIN_BOTTOM_PT = 12.2; // 244 twips

// Topmarge voor vervolgpagina's (pagina 2+). Pagina 1 heeft vóór de eerste
// zichtbare tekstregel ("PERSBERICHT") drie lege alinea's staan, waardoor
// de tekst vanzelf onder de 127pt hoge briefhoofdafbeelding uitkomt, ook al
// is MARGIN_TOP_PT (120.5pt) kleiner dan de afbeeldingshoogte. Een
// vervolgpagina begint middenin de doorlopende tekst, zonder die lege
// alinea's, dus zonder aangepaste marge zou de eerste regel tekst over het
// logo heen vallen. Deze waarde is zo berekend dat de eerste regel op een
// vervolgpagina dezelfde zichtbare afstand tot de afbeelding houdt als
// "PERSBERICHT" op pagina 1 (afbeeldingshoogte + gemeten liniaal-gap op
// pagina 1 + lettertype-ascent van de broodtekst bij 12pt) — zie
// scratchpad-berekening in de sessie die dit invoerde.
export const CONTINUATION_MARGIN_TOP_PT = 168.73; // 3375 twips

// Regelhoogte als veelvoud van de lettergrootte (benadering van "enkele
// regelafstand" — het referentiedocument specificeert zelf geen expliciete
// w:spacing, dus dit volgt Word's eigen standaardgedrag). Dezelfde
// verhouding voor alle lettergroottes.
export const LINE_HEIGHT_RATIO = 1.22;

// Witruimte tussen de onderkant van de liniaal na "PERSBERICHT" en de
// bovenkant van de titel. Het referentiedocument heeft hier één lege
// positioneringsalinea zonder expliciete regelafstand (sz 12pt, ~1 regel) —
// dat bleek in de praktijk te weinig ruimte te geven (titel kwam vrijwel
// direct onder de liniaal te staan). Vastgezet op een expliciete waarde
// (~6,25mm, gemeten als ca. 38px bij 150dpi) in plaats van een uit
// lettergrootte afgeleide regelhoogte: de Word-export zet dit als een
// exacte regelafstand (w:spacing w:line/w:lineRule="exact") op die ene
// alinea, de PDF-export gebruikt dezelfde waarde als vaste regelhoogte.
export const RULE_TO_TITLE_GAP_PT = 18;

// De briefhoofdafbeelding beslaat de volle paginabreedte en is op elke
// pagina even hoog — exact de wp:extent-waarden uit header2.xml/header3.xml
// in het referentiedocument (7556031 x 1612800 EMU, 12700 EMU = 1pt).
export const HEADER_IMAGE_WIDTH_PT = 595;
export const HEADER_IMAGE_HEIGHT_PT = 127;

export const HEADER_FIRST_PAGE_PATH = "public/branding/persbericht-header.png";
export const HEADER_CONTINUATION_PATH = "public/branding/persbericht-header-vervolg.png";

// Wordt bij naam doorgegeven aan de Word-export — Word gebruikt dan het
// lokaal geïnstalleerde lettertype (geen embedding nodig/mogelijk nodig).
export const FONT_FAMILY = "Verdana";

// Lettertypebestanden die de PDF-export embed. Zie de bestandskop hierboven
// voor waarom dit (nog) geen echte Verdana is.
export const PDF_FONT_REGULAR_PATH = "public/fonts/dejavu-sans/DejaVuSans.ttf";
export const PDF_FONT_BOLD_PATH = "public/fonts/dejavu-sans/DejaVuSans-Bold.ttf";

// Lettergroottes — rechtstreeks uit de w:sz-waarden (halve punten) in
// word/document.xml resp. het standaard-stijlgewicht (w:docDefaults, sz=24
// → 12pt) voor paragrafen zonder expliciete sz.
export const MASTHEAD_SIZE_PT = 20; // "PERSBERICHT" + datum — sz 40
export const TITLE_SIZE_PT = 15; // titel — sz 30
export const TITLE_SPACER_SIZE_PT = 11; // lege alinea tussen titel en inleiding — sz 22
export const BODY_SIZE_PT = 12; // inleiding + overige tekst — standaardgrootte

export const RULE_COLOR = "000000";
