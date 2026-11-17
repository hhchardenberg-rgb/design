// Teksten voor ticketmails, de ticketpagina en de pdf in het Nederlands, Duits en Engels.
// Pure TypeScript zonder imports, zodat server en client dit kunnen delen.

export const LOCALES = { nl: "Nederlands", de: "Deutsch", en: "English" } as const;
export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = "nl";
export const isLocale = (v: unknown): v is Locale => typeof v === "string" && v in LOCALES;
export const asLocale = (v: unknown): Locale => (isLocale(v) ? v : DEFAULT_LOCALE);

/** Vaste teksten van de ticketweergave (mobiel en pdf) die niet uit het ontwerp komen. */
export interface ViewTexts {
  ticketAria: string;
  cancelled: string;
  createdAt: string;
  ticketNumber: string;
  sponsorsAria: string;
  qrAria: string;
  qrSampleAria: string;
  langNav: string;
  seasonCard: string;
  seasonWord: string;
  matchesTitle: (n: number) => string;
  entry: string;
  route: string;
  contact: string;
  practical: string;
  entrance: string;
  zone: string;
  opponent: string;
  clubFallback: string;
  noticeCancelled: string;
  noticeMoved: (dateTime: string) => string;
  validSeason: (o: { homeOnly: boolean; competitions: string[]; season: string | null }) => string;
  validRange: (from: string, to: string) => string;
  validMatches: (n: number) => string;
  validMatch: (title: string) => string;
  validUntilDay: (day: string) => string;
  /** Uitleg bij een ticket dat niet (meer) bruikbaar is: geen QR-code, wel wat te doen. */
  inactive: Record<"BLOCKED" | "CANCELLED" | "EXPIRED", { title: string; body: string }>;
  weekdayLocale: string;
  /** Begin van het WhatsApp-bericht met de ticketlink (de link komt erachter). */
  whatsappIntro: string;
}

export interface Texts {
  v: ViewTexts;
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
    v: {
      ticketAria: "Ticket",
      cancelled: "Afgelast",
      createdAt: "Aangemaakt op",
      ticketNumber: "Ticketnummer",
      sponsorsAria: "Sponsoren",
      qrAria: "QR-code van je ticket",
      qrSampleAria: "QR-code (voorbeeld, geeft geen toegang)",
      langNav: "Taal / Language",
      seasonCard: "Seizoenskaart",
      seasonWord: "Seizoen",
      matchesTitle: (n) => `${n} wedstrijden`,
      entry: "Entree",
      route: "Route en parkeren",
      contact: "Contact",
      practical: "Praktische informatie",
      entrance: "Ingang",
      zone: "Vak",
      opponent: "Tegenstander",
      clubFallback: "HHC Hardenberg",
      noticeCancelled: "Deze wedstrijd is afgelast. Bewaar je ticket: je hoort van HHC Hardenberg wat er verder gebeurt.",
      noticeMoved: (d) => `Deze wedstrijd is verplaatst. De datum en tijd hier zijn actueel (${d}). Een eerder gedownloade of geprinte versie toont nog de oude datum: download zo nodig het A4-ticket opnieuw.`,
      validSeason: (o) => `Geldig voor ${o.homeOnly ? "alle thuiswedstrijden" : "alle wedstrijden"} van HHC Hardenberg${o.competitions.length ? ` in ${o.competitions.join(", ")}` : ""}${o.season ? ` in seizoen ${o.season}` : ""}`,
      validRange: (a, b) => `Geldig van ${a} t/m ${b}`,
      validMatches: (n) => `Geldig voor ${n} wedstrijden`,
      validMatch: (t) => `Geldig voor ${t}`,
      validUntilDay: (d) => `Geldig t/m ${d}`,
      inactive: {
        BLOCKED: { title: "Dit ticket is geblokkeerd", body: "Er wordt daarom geen QR-code getoond en je komt er niet mee binnen. Denk je dat dit niet klopt? Neem contact op met de klantenservice van HHC Hardenberg, dan kijken we ernaar." },
        CANCELLED: { title: "Dit ticket is geannuleerd", body: "Er wordt daarom geen QR-code getoond en je komt er niet mee binnen. Heb je vragen of denk je dat dit niet klopt? Neem contact op met de klantenservice van HHC Hardenberg." },
        EXPIRED: { title: "Dit ticket is verlopen", body: "De geldigheid van dit ticket is verstreken, daarom wordt er geen QR-code meer getoond. Vragen? Neem contact op met de klantenservice van HHC Hardenberg." },
      },
      weekdayLocale: "nl-NL",
      whatsappIntro: "Je ticket voor HHC Hardenberg:",
    },
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
    v: {
      ticketAria: "Ticket",
      cancelled: "Cancelled",
      createdAt: "Created on",
      ticketNumber: "Ticket number",
      sponsorsAria: "Sponsors",
      qrAria: "QR code of your ticket",
      qrSampleAria: "QR code (sample, no admission)",
      langNav: "Taal / Language",
      seasonCard: "Season pass",
      seasonWord: "Season",
      matchesTitle: (n) => `${n} matches`,
      entry: "Entry",
      route: "Directions and parking",
      contact: "Contact",
      practical: "Practical information",
      entrance: "Entrance",
      zone: "Section",
      opponent: "Opponent",
      clubFallback: "HHC Hardenberg",
      noticeCancelled: "This match has been cancelled. Keep your ticket: HHC Hardenberg will let you know what happens next.",
      noticeMoved: (d) => `This match has been moved. The date and time shown here are up to date (${d}). A version you downloaded or printed earlier still shows the old date: download the A4 ticket again if needed.`,
      validSeason: (o) => `Valid for ${o.homeOnly ? "all home matches" : "all matches"} of HHC Hardenberg${o.competitions.length ? ` in ${o.competitions.join(", ")}` : ""}${o.season ? ` in season ${o.season}` : ""}`,
      validRange: (a, b) => `Valid from ${a} to ${b}`,
      validMatches: (n) => `Valid for ${n} matches`,
      validMatch: (t) => `Valid for ${t}`,
      validUntilDay: (d) => `Valid until ${d}`,
      inactive: {
        BLOCKED: { title: "This ticket has been blocked", body: "No QR code is shown, so it will not get you in. If you think this is a mistake, please contact the HHC Hardenberg customer service and we will look into it." },
        CANCELLED: { title: "This ticket has been cancelled", body: "No QR code is shown, so it will not get you in. If you have questions or think this is a mistake, please contact the HHC Hardenberg customer service." },
        EXPIRED: { title: "This ticket has expired", body: "The validity of this ticket has ended, so no QR code is shown any more. Questions? Please contact the HHC Hardenberg customer service." },
      },
      weekdayLocale: "en-GB",
      whatsappIntro: "Your ticket for HHC Hardenberg:",
    },
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
    v: {
      ticketAria: "Ticket",
      cancelled: "Abgesagt",
      createdAt: "Erstellt am",
      ticketNumber: "Ticketnummer",
      sponsorsAria: "Sponsoren",
      qrAria: "QR-Code deines Tickets",
      qrSampleAria: "QR-Code (Beispiel, kein Zutritt)",
      langNav: "Taal / Language",
      seasonCard: "Saisonkarte",
      seasonWord: "Saison",
      matchesTitle: (n) => `${n} Spiele`,
      entry: "Einlass",
      route: "Anfahrt und Parken",
      contact: "Kontakt",
      practical: "Praktische Informationen",
      entrance: "Eingang",
      zone: "Bereich",
      opponent: "Gegner",
      clubFallback: "HHC Hardenberg",
      noticeCancelled: "Dieses Spiel wurde abgesagt. Bewahre dein Ticket auf: HHC Hardenberg informiert dich, wie es weitergeht.",
      noticeMoved: (d) => `Dieses Spiel wurde verlegt. Datum und Uhrzeit hier sind aktuell (${d}). Eine zuvor heruntergeladene oder ausgedruckte Version zeigt noch das alte Datum: lade das A4-Ticket bei Bedarf erneut herunter.`,
      validSeason: (o) => `Gültig für ${o.homeOnly ? "alle Heimspiele" : "alle Spiele"} von HHC Hardenberg${o.competitions.length ? ` in ${o.competitions.join(", ")}` : ""}${o.season ? ` in der Saison ${o.season}` : ""}`,
      validRange: (a, b) => `Gültig von ${a} bis ${b}`,
      validMatches: (n) => `Gültig für ${n} Spiele`,
      validMatch: (t) => `Gültig für ${t}`,
      validUntilDay: (d) => `Gültig bis ${d}`,
      inactive: {
        BLOCKED: { title: "Dieses Ticket ist gesperrt", body: "Deshalb wird kein QR-Code angezeigt und du kommst damit nicht hinein. Denkst du, dass das nicht stimmt? Wende dich an den Kundenservice von HHC Hardenberg, dann schauen wir es uns an." },
        CANCELLED: { title: "Dieses Ticket wurde storniert", body: "Deshalb wird kein QR-Code angezeigt und du kommst damit nicht hinein. Hast du Fragen oder denkst du, dass das nicht stimmt? Wende dich an den Kundenservice von HHC Hardenberg." },
        EXPIRED: { title: "Dieses Ticket ist abgelaufen", body: "Die Gültigkeit dieses Tickets ist abgelaufen, deshalb wird kein QR-Code mehr angezeigt. Fragen? Wende dich an den Kundenservice von HHC Hardenberg." },
      },
      weekdayLocale: "de-DE",
      whatsappIntro: "Dein Ticket für HHC Hardenberg:",
    },
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

/**
 * Standaardteksten van het ontwerp (NL) met hun vertaling. Staat een veld nog op zo'n standaardtekst
 * (of die van een basisontwerp), dan volgt de weergave de taal van het ticket. Door een beheerder
 * aangepaste of zelf ingevoerde teksten blijven altijd precies zoals ingevoerd.
 */
export const DESIGN_TEXT_TRANSLATIONS: Record<string, { de: string; en: string }> = {
  Naam: { de: "Name", en: "Name" },
  Houder: { de: "Inhaber", en: "Holder" },
  Gast: { de: "Gast", en: "Guest" },
  Ingang: { de: "Eingang", en: "Entrance" },
  Vak: { de: "Bereich", en: "Section" },
  "Toon deze code bij de ingang": { de: "Zeige diesen Code am Eingang", en: "Show this code at the entrance" },
  "Toon deze kaart bij iedere geldige wedstrijd": { de: "Zeige diese Karte bei jedem gültigen Spiel", en: "Show this card at every valid match" },
  "Aanvang {{aanvangstijd}}": { de: "Beginn {{aanvangstijd}}", en: "Start {{aanvangstijd}}" },
  "Poorten open {{poorten_open}}": { de: "Einlass ab {{poorten_open}}", en: "Gates open {{poorten_open}}" },
  "Praktische informatie": { de: "Praktische Informationen", en: "Practical information" },
  "Kom op tijd: de poorten openen om {{poorten_open}}. Houd je ticket klaar bij de ingang.": { de: "Komm rechtzeitig: der Einlass beginnt um {{poorten_open}}. Halte dein Ticket am Eingang bereit.", en: "Arrive in good time: the gates open at {{poorten_open}}. Have your ticket ready at the entrance." },
  "Toon je kaart bij de ingang. De scanner controleert bij iedere wedstrijd of de kaart geldig is.": { de: "Zeige deine Karte am Eingang. Der Scanner prüft bei jedem Spiel, ob die Karte gültig ist.", en: "Show your card at the entrance. The scanner checks at every match whether the card is valid." },
  "Seizoenskaart {{seizoen}}": { de: "Saisonkarte {{seizoen}}", en: "Season pass {{seizoen}}" },
  Seizoenskaart: { de: "Saisonkarte", en: "Season pass" },
  "Met dank aan onze partners": { de: "Mit Dank an unsere Partner", en: "With thanks to our partners" },
  "Partners van HHC Hardenberg": { de: "Partner von HHC Hardenberg", en: "Partners of HHC Hardenberg" },
  "Persoonlijke uitnodiging. Toon dit ticket bij de ingang.": { de: "Persönliche Einladung. Zeige dieses Ticket am Eingang.", en: "Personal invitation. Show this ticket at the entrance." },
  Welkom: { de: "Willkommen", en: "Welcome" },
  "Fijn dat je onze gast bent. Heb je vragen over je bezoek? Neem dan contact op met je vaste contactpersoon bij HHC Hardenberg.": { de: "Schön, dass du unser Gast bist. Hast du Fragen zu deinem Besuch? Wende dich an deinen festen Ansprechpartner bei HHC Hardenberg.", en: "Great to have you as our guest. Questions about your visit? Please contact your regular contact person at HHC Hardenberg." },
  "Dit ticket is persoonsgebonden en niet overdraagbaar. Toegang alleen na een geldige scan bij de ingang; de scanner bepaalt de actuele geldigheid. Deel de QR-code niet met anderen.": { de: "Dieses Ticket ist personengebunden und nicht übertragbar. Zutritt nur nach einem gültigen Scan am Eingang; der Scanner bestimmt die aktuelle Gültigkeit. Gib den QR-Code nicht an andere weiter.", en: "This ticket is personal and not transferable. Admission only after a valid scan at the entrance; the scanner determines current validity. Do not share the QR code with others." },
};
