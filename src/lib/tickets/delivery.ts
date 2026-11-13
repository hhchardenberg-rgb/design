// Pure helpers voor het afleveren van tickets (geen database): templates en tekstvervanging.

export const TEMPLATE_VARIABLES = [
  { key: "voornaam", label: "Voornaam van de tickethouder" },
  { key: "achternaam", label: "Achternaam" },
  { key: "type", label: "Tickettype" },
  { key: "wedstrijd", label: "Wedstrijd of geldigheid" },
  { key: "link", label: "Persoonlijke ticketlink" },
  { key: "datum", label: "Nieuwe datum en tijd (alleen bij verplaatsen)" },
  { key: "oudedatum", label: "Oorspronkelijke datum en tijd (alleen bij verplaatsen)" },
  { key: "bericht", label: "Eigen toelichting van de organisatie" },
] as const;

const BASE_TEMPLATES = {
  ticket: {
    name: "Ticketmail",
    nl: { subject: "Jouw ticket voor {wedstrijd}", body: "Hallo {voornaam},\n\nHierbij je ticket ({type}) voor {wedstrijd}. Via de knop hieronder open je je persoonlijke ticket met QR-code. Toon die bij de ingang, op je telefoon of geprint.\n\nDeel deze link niet met anderen: het ticket is persoonlijk.\n\nTot ziens bij HHC Hardenberg!" },
    en: { subject: "Your ticket for {wedstrijd}", body: "Hello {voornaam},\n\nHere is your ticket ({type}) for {wedstrijd}. Use the button below to open your personal ticket with QR code. Show it at the entrance, on your phone or printed.\n\nPlease do not share this link: the ticket is personal.\n\nSee you at HHC Hardenberg!" },
    de: { subject: "Dein Ticket für {wedstrijd}", body: "Hallo {voornaam},\n\nHier ist dein Ticket ({type}) für {wedstrijd}. Über den Button unten öffnest du dein persönliches Ticket mit QR-Code. Zeige es am Eingang, auf dem Handy oder ausgedruckt.\n\nBitte teile diesen Link nicht: das Ticket ist persönlich.\n\nBis bald bei HHC Hardenberg!" },
  },
  event_moved: {
    name: "Wedstrijd verplaatst",
    nl: { subject: "{wedstrijd} is verplaatst", body: "Hallo {voornaam},\n\nDe wedstrijd {wedstrijd} is verplaatst van {oudedatum} naar {datum}.\n\nJe ticket ({type}) blijft geldig voor de nieuwe datum. Je hoeft niets te doen: via de knop hieronder open je je ticket.\n\n{bericht}\n\nTot ziens bij HHC Hardenberg!" },
    en: { subject: "{wedstrijd} has been rescheduled", body: "Hello {voornaam},\n\nThe match {wedstrijd} has been moved from {oudedatum} to {datum}.\n\nYour ticket ({type}) remains valid for the new date. You do not need to do anything: use the button below to open your ticket.\n\n{bericht}\n\nSee you at HHC Hardenberg!" },
    de: { subject: "{wedstrijd} wurde verschoben", body: "Hallo {voornaam},\n\nDas Spiel {wedstrijd} wurde von {oudedatum} auf {datum} verschoben.\n\nDein Ticket ({type}) bleibt für den neuen Termin gültig. Du musst nichts tun: über den Button unten öffnest du dein Ticket.\n\n{bericht}\n\nBis bald bei HHC Hardenberg!" },
  },
  event_cancelled: {
    name: "Wedstrijd afgelast",
    nl: { subject: "{wedstrijd} is afgelast", body: "Hallo {voornaam},\n\nHelaas is de wedstrijd {wedstrijd} ({oudedatum}) afgelast.\n\nZodra er een nieuwe datum is, laten we het je weten. Je ticket ({type}) blijft bewaard.\n\n{bericht}\n\nBedankt voor je begrip,\nHHC Hardenberg" },
    en: { subject: "{wedstrijd} has been cancelled", body: "Hello {voornaam},\n\nUnfortunately the match {wedstrijd} ({oudedatum}) has been cancelled.\n\nWe will let you know as soon as there is a new date. Your ticket ({type}) will be kept.\n\n{bericht}\n\nThank you for your understanding,\nHHC Hardenberg" },
    de: { subject: "{wedstrijd} wurde abgesagt", body: "Hallo {voornaam},\n\nLeider wurde das Spiel {wedstrijd} ({oudedatum}) abgesagt.\n\nSobald es einen neuen Termin gibt, informieren wir dich. Dein Ticket ({type}) bleibt gespeichert.\n\n{bericht}\n\nDanke für dein Verständnis,\nHHC Hardenberg" },
  },
} as const;

const LOCALE_NAMES = { nl: "Nederlands", en: "Engels", de: "Duits" } as const;

/** Alle templates, ook per taal: "ticket" (Nederlands), "ticket.en", "ticket.de", enzovoort. */
export const DEFAULT_TEMPLATES: Record<string, { name: string; subject: string; body: string }> = Object.fromEntries(
  Object.entries(BASE_TEMPLATES).flatMap(([key, t]) =>
    (["nl", "en", "de"] as const).map((l) => [l === "nl" ? key : `${key}.${l}`, { name: l === "nl" ? t.name : `${t.name} (${LOCALE_NAMES[l]})`, ...t[l] }]),
  ),
);

/** Vervangt {variabele}-plekken; onbekende plekken blijven staan zodat een typfout zichtbaar is. */
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{([a-z]+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

/** Een mailtemplate moet de ticketlink bevatten of krijgt die er onderaan bij (de knop in de mail doet dat al). */
export function templateIssues(subject: string, body: string): string[] {
  const out: string[] = [];
  if (!subject.trim()) out.push("Het onderwerp mag niet leeg zijn.");
  if (!body.trim()) out.push("De tekst mag niet leeg zijn.");
  const known = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));
  for (const m of `${subject} ${body}`.matchAll(/\{([a-z]+)\}/g)) if (!known.has(m[1])) out.push(`Onbekende variabele {${m[1]}}.`);
  return [...new Set(out)];
}

/** Bestandsveilige tekst voor de standaardlettertypen van een PDF (WinAnsi). */
export function pdfSafe(text: string): string {
  return text.replace(/[^\x20-\x7e\xa0-\xff]/g, (c) => c.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?"));
}
