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

export const DEFAULT_TEMPLATES: Record<string, { name: string; subject: string; body: string }> = {
  ticket: {
    name: "Ticketmail",
    subject: "Jouw ticket voor {wedstrijd}",
    body: "Hallo {voornaam},\n\nHierbij je ticket ({type}) voor {wedstrijd}. Via de knop hieronder open je je persoonlijke ticket met QR-code. Toon die bij de ingang, op je telefoon of geprint.\n\nDeel deze link niet met anderen: het ticket is persoonlijk.\n\nTot ziens bij HHC Hardenberg!",
  },
  event_moved: {
    name: "Wedstrijd verplaatst",
    subject: "{wedstrijd} is verplaatst",
    body: "Hallo {voornaam},\n\nDe wedstrijd {wedstrijd} is verplaatst van {oudedatum} naar {datum}.\n\nJe ticket ({type}) blijft geldig voor de nieuwe datum. Je hoeft niets te doen: via de knop hieronder open je je ticket.\n\n{bericht}\n\nTot ziens bij HHC Hardenberg!",
  },
  event_cancelled: {
    name: "Wedstrijd afgelast",
    subject: "{wedstrijd} is afgelast",
    body: "Hallo {voornaam},\n\nHelaas is de wedstrijd {wedstrijd} ({oudedatum}) afgelast.\n\nZodra er een nieuwe datum is, laten we het je weten. Je ticket ({type}) blijft bewaard.\n\n{bericht}\n\nBedankt voor je begrip,\nHHC Hardenberg",
  },
};

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
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "?");
}
