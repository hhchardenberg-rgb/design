// Gedeelde lay-outwaarden voor de persbericht-generator, zodat de Word- en
// PDF-export (src/app/api/press-releases/[id]/docx en /pdf) dezelfde opmaak
// gebruiken.
//
// De waarden hieronder zijn NIET overgenomen uit de OOXML van het eerder
// aangeleverde voorbeelddocument (dat bleek onbetrouwbaar: de marge die daar
// letterlijk in stond gaf te weinig witruimte en liet "PERSBERICHT" zelfs
// over het clublogo heen lopen). In plaats daarvan zijn ze rechtstreeks
// gemeten uit de content stream van een echt HHC-persbericht in PDF-vorm
// (het Ben Scholte-voorbeeld): de PDF is geen "plaatje" maar bevat exacte
// tekstcoördinaten (Tm-operators) en lijnposities, dus dit is de meest
// betrouwbare bron die we hebben. Wijzig deze waarden alleen na eenzelfde
// soort meting op een nieuw echt voorbeeld — niet op gevoel.
//
// HHC heeft de echte FF DIN-bestanden aangeleverd (public/fonts/ff-din),
// dus zowel de Word- als de PDF-export gebruiken nu het officiële
// lettertype. Let op: in het lettertypebestand zelf heet de familie "DIN"
// (niet "FF DIN") — "FF" is het foundry-voorvoegsel (FontFont) dat in de
// productnaam zit maar niet in de ingebedde family-naam. Windows/Word
// registreert het font dus als "DIN" zodra het geïnstalleerd is; met
// FONT_FAMILY="FF DIN" in de Word-export zou Word het lettertype niet
// terugvinden en alsnog terugvallen op een systeemfont.
//
// De linker/rechter marge is bewust gelijk gemaakt (gemiddelde van de twee
// gemeten waarden in het voorbeeld-PDF, die daar onterecht ongelijk waren)
// zodat de tekst gecentreerd staat, met dezelfde totale kolombreedte als
// gemeten.

// A4 in punten (1 punt = 1/72 inch; Word gebruikt twips = 1/20 punt).
export const PAGE_WIDTH_PT = 595;
export const PAGE_HEIGHT_PT = 842;

// Marge tot de linker/rechter tekstrand. Gelijk aan elkaar (zie hierboven),
// op het gemiddelde van de twee in het voorbeeld-PDF gemeten waarden
// (78 en 52.36) — zo blijft de kolom precies even breed als gemeten.
export const MARGIN_LEFT_PT = 65.18;
export const MARGIN_RIGHT_PT = 65.18;
export const MARGIN_BOTTOM_PT = 12.2;

// Afstand vanaf de bovenkant van de pagina tot de basislijn van "PERSBERICHT"
// op de eerste pagina (gemeten: 842 - 649.44 = 192.56).
export const MARGIN_TOP_PT = 192.56;
// Afstand tot de liniaal onder "PERSBERICHT", de titel en de aanhef van de
// vetgedrukte inleiding — elk gemeten op dezelfde manier. Deze zijn vaste
// afstanden (onafhankelijk van de hoeveelheid tekst erna) omdat ze altijd
// op dezelfde plek staan zolang titel en inleiding op één regel passen.
export const RULE_AFTER_MASTHEAD_TOP_PT = 212.84;
export const TITLE_TOP_PT = 242.72;
export const LEAD_TOP_PT = 271.52;
// Vaste marge boven de tekst op vervolgpagina's (onder het kleinere
// briefhoofd met alleen het logo) — hiervoor was geen vervolgpagina in het
// voorbeeld beschikbaar om te meten, dus dit is een inschatting die
// visueel in verhouding is met de rest van de opmaak.
export const CONTINUATION_MARGIN_TOP_PT = 165;

// Regelhoogte als veelvoud van de lettergrootte, gemeten aan het verschil
// tussen opeenvolgende regel-basislijnen in de vetgedrukte inleiding
// (14.4–14.64pt bij 12pt tekst ≈ 1.22).
export const LINE_HEIGHT_RATIO = 1.22;

// De briefhoofdafbeelding beslaat de volle paginabreedte (bleed, geen
// marge) en is even hoog op elke pagina — op de eerste pagina de volledige
// balk (logo + adres + sponsors), op vervolgpagina's alleen het logo.
export const HEADER_IMAGE_WIDTH_PT = 595;
export const HEADER_IMAGE_HEIGHT_PT = 127;
export const HEADER_IMAGE_ASPECT = 2481 / 532; // breedte/hoogte van de bronafbeelding

export const HEADER_FIRST_PAGE_PATH = "public/branding/persbericht-header.png";
export const HEADER_CONTINUATION_PATH = "public/branding/persbericht-header-vervolg.png";

// Wordt bij naam doorgegeven aan de Word-export (geen embedding nodig —
// Word gebruikt het lokaal geïnstalleerde lettertype). Zie de bestandskop
// hierboven voor waarom dit "DIN" is en niet "FF DIN".
export const FONT_FAMILY = "DIN";

// Lettertypebestand dat de PDF-export embed (moet, want een PDF-viewer
// doet geen fontsubstitutie zoals Word dat doet). FF DIN kent geen aparte
// "Regular"-snit; "Medium" is het basisgewicht dat als normale tekst dient.
//
// PDF_FONT_BOLD_PATH wijst bewust ook naar Medium: de aangeleverde
// FF_DIN_Bold.otf en FF_DIN_Black.otf zijn intern wel als zwaardere snit
// gelabeld (andere bestandsgrootte, andere OS/2-gewichtsklasse), maar de
// letteromtrekken zelf zijn niet zwaarder — geverifieerd door ze naast
// elkaar te renderen op grote puntgrootte, met én zonder font-subsetting:
// identieke lijndikte. Tot er een Bold-bestand is dat er ook echt vetter
// uitziet, gebruikt de PDF dus overal Medium (de Word-export heeft dit
// probleem niet, want die verwijst alleen naar het lokaal geïnstalleerde
// lettertype en laat Word zelf de juiste snit kiezen).
export const PDF_FONT_REGULAR_PATH = "public/fonts/ff-din/FF_DIN_Medium.otf";
export const PDF_FONT_BOLD_PATH = "public/fonts/ff-din/FF_DIN_Medium.otf";

export const MASTHEAD_SIZE_PT = 20; // "PERSBERICHT" + datum
export const TITLE_SIZE_PT = 15;
export const BODY_SIZE_PT = 12;

export const RULE_COLOR = "000000";
