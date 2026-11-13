// Teksten voor ticketmails, de ticketpagina en de pdf in het Nederlands, Duits en Engels.
// Pure TypeScript zonder imports, zodat server en client dit kunnen delen.

export const LOCALES = { nl: "Nederlands", de: "Deutsch", en: "English" } as const;
export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = "nl";
export const isLocale = (v: unknown): v is Locale => typeof v === "string" && v in LOCALES;
export const asLocale = (v: unknown): Locale => (isLocale(v) ? v : DEFAULT_LOCALE);

export interface Texts {
  viewTicket: string;
  pageTitle: string;
  invalidLinkTitle: string;
  invalidLinkBody: string;
  qrAlt: string;
  notValid: (status: string) => string;
  zone: string;
  validUntil: string;
  downloadPdf: string;
  personalNote: string;
  matches: (n: number) => string;
  clubName: string;
  status: Record<"ACTIVE" | "BLOCKED" | "CANCELLED" | "EXPIRED", string>;
  pdf: { title: string; scanHere: string; personal: string; tip: string; validUntil: string };
}

export const TEXTS: Record<Locale, Texts> = {
  nl: {
    viewTicket: "Bekijk je ticket",
    pageTitle: "Jouw ticket – HHC Hardenberg",
    invalidLinkTitle: "Deze ticketlink werkt niet meer",
    invalidLinkBody: "De link is ingetrokken of niet juist. Vraag HHC Hardenberg om je ticket opnieuw te sturen.",
    qrAlt: "QR-code van je ticket",
    notValid: (s) => `Dit ticket is niet geldig (${s}).`,
    zone: "Vak",
    validUntil: "Geldig t/m",
    downloadPdf: "Download als PDF",
    personalNote: "Persoonlijk ticket. Laat de QR-code niet door anderen scannen of kopiëren.",
    matches: (n) => `${n} wedstrijden`,
    clubName: "HHC Hardenberg",
    status: { ACTIVE: "geldig", BLOCKED: "geblokkeerd", CANCELLED: "geannuleerd", EXPIRED: "verlopen" },
    pdf: { title: "Toegangsbewijs", scanHere: "Laat deze code scannen bij de ingang", personal: "Persoonlijk en niet overdraagbaar. Deel de QR-code niet met anderen: wie hem als eerste scant, komt binnen.", tip: "Tip: zet de helderheid van je scherm hoog als je het ticket op je telefoon laat zien.", validUntil: "Geldig t/m" },
  },
  en: {
    viewTicket: "View your ticket",
    pageTitle: "Your ticket – HHC Hardenberg",
    invalidLinkTitle: "This ticket link no longer works",
    invalidLinkBody: "The link has been withdrawn or is incorrect. Ask HHC Hardenberg to send your ticket again.",
    qrAlt: "QR code of your ticket",
    notValid: (s) => `This ticket is not valid (${s}).`,
    zone: "Section",
    validUntil: "Valid until",
    downloadPdf: "Download as PDF",
    personalNote: "Personal ticket. Do not let others scan or copy the QR code.",
    matches: (n) => `${n} matches`,
    clubName: "HHC Hardenberg",
    status: { ACTIVE: "valid", BLOCKED: "blocked", CANCELLED: "cancelled", EXPIRED: "expired" },
    pdf: { title: "Admission ticket", scanHere: "Have this code scanned at the entrance", personal: "Personal and not transferable. Do not share the QR code: whoever scans it first, gets in.", tip: "Tip: turn your screen brightness up when showing the ticket on your phone.", validUntil: "Valid until" },
  },
  de: {
    viewTicket: "Dein Ticket ansehen",
    pageTitle: "Dein Ticket – HHC Hardenberg",
    invalidLinkTitle: "Dieser Ticket-Link funktioniert nicht mehr",
    invalidLinkBody: "Der Link wurde widerrufen oder ist nicht korrekt. Bitte HHC Hardenberg, dir das Ticket erneut zu schicken.",
    qrAlt: "QR-Code deines Tickets",
    notValid: (s) => `Dieses Ticket ist nicht gültig (${s}).`,
    zone: "Bereich",
    validUntil: "Gültig bis",
    downloadPdf: "Als PDF herunterladen",
    personalNote: "Persönliches Ticket. Lass den QR-Code nicht von anderen scannen oder kopieren.",
    matches: (n) => `${n} Spiele`,
    clubName: "HHC Hardenberg",
    status: { ACTIVE: "gültig", BLOCKED: "gesperrt", CANCELLED: "storniert", EXPIRED: "abgelaufen" },
    pdf: { title: "Eintrittskarte", scanHere: "Lass diesen Code am Eingang scannen", personal: "Persönlich und nicht übertragbar. Gib den QR-Code nicht weiter: wer ihn zuerst scannt, kommt hinein.", tip: "Tipp: Stelle die Helligkeit deines Bildschirms hoch, wenn du das Ticket auf dem Handy zeigst.", validUntil: "Gültig bis" },
  },
};

export const textsFor = (l: unknown): Texts => TEXTS[asLocale(l)];

/** Sleutel van een mailtemplate per taal: Nederlands is de basis, de rest krijgt een achtervoegsel. */
export const templateKeyFor = (base: string, locale: Locale): string => (locale === DEFAULT_LOCALE ? base : `${base}.${locale}`);
