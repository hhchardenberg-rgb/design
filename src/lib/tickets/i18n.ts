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
  offlineNote: string;
  matches: (n: number) => string;
  clubName: string;
  status: Record<"ACTIVE" | "BLOCKED" | "CANCELLED" | "EXPIRED", string>;
  pdf: { title: string; scanHere: string; personal: string; tip: string; validUntil: string };
  ui: { showQr: string; close: string; downloadA4: string; saveOffline: string; savedOffline: string; offlineSaveHelp: string; offlineValidity: string; ticketNumber: string; qrDialog: string; brightness: string; status: string; sample: string };
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
    offlineNote: "Je hebt geen verbinding. Dit is de laatst opgeslagen versie van je ticket; de QR-code werkt gewoon.",
    matches: (n) => `${n} wedstrijden`,
    clubName: "HHC Hardenberg",
    status: { ACTIVE: "geldig", BLOCKED: "geblokkeerd", CANCELLED: "geannuleerd", EXPIRED: "verlopen" },
    pdf: { title: "Toegangsbewijs", scanHere: "Laat deze code scannen bij de ingang", personal: "Persoonlijk en niet overdraagbaar. Deel de QR-code niet met anderen: wie hem als eerste scant, komt binnen.", tip: "Tip: zet de helderheid van je scherm hoog als je het ticket op je telefoon laat zien.", validUntil: "Geldig t/m" },
    ui: { showQr: "Toon QR-code", close: "Sluiten", downloadA4: "Download A4-ticket (pdf)", saveOffline: "Bewaar op dit toestel", savedOffline: "Opgeslagen: dit ticket opent ook zonder internet.", offlineSaveHelp: "Handig bij slecht bereik bij het stadion. Je kunt ook het A4-ticket downloaden of een schermafbeelding maken.", offlineValidity: "Je ziet een opgeslagen versie. De QR-code werkt; of het ticket nu geldig is, bepaalt de scanner bij de ingang.", ticketNumber: "Ticketnummer", qrDialog: "QR-code vergroot", brightness: "Zet de helderheid van je scherm hoog.", status: "Status", sample: "Voorbeeld – geeft geen toegang" },
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
    offlineNote: "You are offline. This is the last saved version of your ticket; the QR code works as usual.",
    matches: (n) => `${n} matches`,
    clubName: "HHC Hardenberg",
    status: { ACTIVE: "valid", BLOCKED: "blocked", CANCELLED: "cancelled", EXPIRED: "expired" },
    pdf: { title: "Admission ticket", scanHere: "Have this code scanned at the entrance", personal: "Personal and not transferable. Do not share the QR code: whoever scans it first, gets in.", tip: "Tip: turn your screen brightness up when showing the ticket on your phone.", validUntil: "Valid until" },
    ui: { showQr: "Show QR code", close: "Close", downloadA4: "Download A4 ticket (pdf)", saveOffline: "Save on this device", savedOffline: "Saved: this ticket also opens without internet.", offlineSaveHelp: "Useful when reception at the stadium is poor. You can also download the A4 ticket or take a screenshot.", offlineValidity: "You are viewing a saved version. The QR code works; the scanner at the entrance decides whether the ticket is valid right now.", ticketNumber: "Ticket number", qrDialog: "Enlarged QR code", brightness: "Turn your screen brightness up.", status: "Status", sample: "Sample – no admission" },
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
    offlineNote: "Du bist offline. Dies ist die zuletzt gespeicherte Version deines Tickets; der QR-Code funktioniert ganz normal.",
    matches: (n) => `${n} Spiele`,
    clubName: "HHC Hardenberg",
    status: { ACTIVE: "gültig", BLOCKED: "gesperrt", CANCELLED: "storniert", EXPIRED: "abgelaufen" },
    pdf: { title: "Eintrittskarte", scanHere: "Lass diesen Code am Eingang scannen", personal: "Persönlich und nicht übertragbar. Gib den QR-Code nicht weiter: wer ihn zuerst scannt, kommt hinein.", tip: "Tipp: Stelle die Helligkeit deines Bildschirms hoch, wenn du das Ticket auf dem Handy zeigst.", validUntil: "Gültig bis" },
    ui: { showQr: "QR-Code zeigen", close: "Schließen", downloadA4: "A4-Ticket herunterladen (pdf)", saveOffline: "Auf diesem Gerät speichern", savedOffline: "Gespeichert: dieses Ticket öffnet auch ohne Internet.", offlineSaveHelp: "Praktisch bei schlechtem Empfang am Stadion. Du kannst auch das A4-Ticket herunterladen oder einen Screenshot machen.", offlineValidity: "Du siehst eine gespeicherte Version. Der QR-Code funktioniert; ob das Ticket jetzt gültig ist, entscheidet der Scanner am Eingang.", ticketNumber: "Ticketnummer", qrDialog: "Vergrößerter QR-Code", brightness: "Stelle die Bildschirmhelligkeit hoch.", status: "Status", sample: "Beispiel – kein Zutritt" },
  },
};

export const textsFor = (l: unknown): Texts => TEXTS[asLocale(l)];

/** Sleutel van een mailtemplate per taal: Nederlands is de basis, de rest krijgt een achtervoegsel. */
export const templateKeyFor = (base: string, locale: Locale): string => (locale === DEFAULT_LOCALE ? base : `${base}.${locale}`);
