// Eén lijst van de huisstijllettertypen van het ticketontwerp. De A4-pdf (server), het
// A4-voorbeeld (svg), de mobiele ticketpagina en het offline bewaren gebruiken allemaal deze
// lijst, zodat overal precies dezelfde bestanden en gewichten worden gebruikt.
//
// - FF DIN (koppen): Medium 500, Bold 700, Black 900.
// - Inter (lopende tekst): 400, 600, 700, 800.
// De pdf sluit de TTF-versies in (pdf-lib kan de CFF-tekens van de OTF niet goed subsetten);
// de browser laadt de OTF/WOFF2-versies. Beide komen uit dezelfde bron, dus de maten zijn gelijk.

import type { FontKey } from "./a4-layout";

export type TicketFontFamily = "din" | "inter";
export type TicketWeight = "medium" | "bold" | "black";

export interface TicketFontFile {
  /** CSS-familienaam (zie ticket-fonts.css). */
  family: "TicketDIN" | "TicketInter";
  weight: number;
  /** Bestand voor de browser, onder public/. */
  web: string;
  /** Bestand dat in de pdf wordt ingesloten, onder public/. */
  pdf: string;
}

export const TICKET_FONTS: Record<FontKey, TicketFontFile> = {
  "din-medium": { family: "TicketDIN", weight: 500, web: "/fonts/ff-din/FF_DIN_Medium.otf", pdf: "fonts/ff-din/FF_DIN_Medium.ttf" },
  "din-bold": { family: "TicketDIN", weight: 700, web: "/fonts/ff-din/FF_DIN_Bold.otf", pdf: "fonts/ff-din/FF_DIN_Bold.ttf" },
  "din-black": { family: "TicketDIN", weight: 900, web: "/fonts/ff-din/FF_DIN_Black.otf", pdf: "fonts/ff-din/FF_DIN_Black.ttf" },
  "inter-400": { family: "TicketInter", weight: 400, web: "/fonts/inter/inter-400.woff2", pdf: "fonts/inter/inter-400.ttf" },
  "inter-600": { family: "TicketInter", weight: 600, web: "/fonts/inter/inter-600.woff2", pdf: "fonts/inter/inter-600.ttf" },
  "inter-700": { family: "TicketInter", weight: 700, web: "/fonts/inter/inter-700.woff2", pdf: "fonts/inter/inter-700.ttf" },
  "inter-800": { family: "TicketInter", weight: 800, web: "/fonts/inter/inter-800.woff2", pdf: "fonts/inter/inter-800.ttf" },
};

/** CSS font-family met nette terugval als het lettertype (nog) niet geladen is. */
export function ticketFontStack(f: TicketFontFamily): string {
  return f === "din" ? '"TicketDIN", "Arial Narrow", Arial, sans-serif' : '"TicketInter", Inter, Arial, sans-serif';
}

/** Lettertype voor koppen, gelijk aan de A4-pdf. */
export function headingFontKey(font: TicketFontFamily, weight: TicketWeight): FontKey {
  if (font === "din") return weight === "medium" ? "din-medium" : weight === "bold" ? "din-bold" : "din-black";
  return weight === "medium" ? "inter-600" : weight === "bold" ? "inter-700" : "inter-800";
}
/** Lopende tekst en vette tekst, gelijk aan de A4-pdf. */
export const bodyFontKey = (font: TicketFontFamily): FontKey => (font === "din" ? "din-medium" : "inter-400");
export const bodyBoldFontKey = (font: TicketFontFamily): FontKey => (font === "din" ? "din-bold" : "inter-700");

/** De bestanden die een ticket met deze instellingen in de browser nodig heeft. */
export function webFontsFor(style: { headingFont: TicketFontFamily; headingWeight: TicketWeight; bodyFont: TicketFontFamily }): string[] {
  const keys = new Set<FontKey>([headingFontKey(style.headingFont, style.headingWeight), bodyFontKey(style.bodyFont), bodyBoldFontKey(style.bodyFont)]);
  // De mobiele pagina gebruikt voor tussenkopjes en knoppen ook halfvet/vet in de tekstletter.
  if (style.bodyFont === "inter") keys.add("inter-600");
  return [...keys].map((k) => TICKET_FONTS[k].web);
}
