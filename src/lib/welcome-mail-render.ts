// Opbouw van de welkomstmail voor een nieuw Hub-account. Gedeeld tussen het echte verzenden (src/lib/mail.ts) en
// het voorbeeld in gebruikersbeheer, zodat het voorbeeld altijd exact is wat de nieuwe gebruiker krijgt.
// Bewust zonder server-only imports.
//
// Er staat nooit een wachtwoord in deze mail: de ontvanger kiest zelf een wachtwoord via een eenmalige instellink.
// Opmaak: dezelfde e-mailveilige stijl als de mails van Commerciële Zaken (src/lib/commercial/mail-render.ts).

const ORANGE = "#ff6f00";
const INK = "#1a1a1a";
const MUTED = "#6b6659";
const PAGE_BG = "#f7f6f4";
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface WelcomeMail {
  name: string;
  email: string;
  /** Eenmalige link om zelf een wachtwoord te kiezen. */
  setPasswordUrl: string;
  /** Al opgemaakt als dd/mm/jjjj. */
  linkValidUntil: string;
  /** De Hub zelf, bv. https://hub.hhc-hardenberg.nl */
  hubUrl: string;
  logoUrl?: string;
}

export function renderWelcomeMail(m: WelcomeMail): { subject: string; html: string; text: string } {
  const loginUrl = `${m.hubUrl}/login`;
  const securityUrl = `${m.hubUrl}/account/security`;
  const p = (html: string) => `<p style="margin:0 0 16px;font:15px/1.65 ${FONT};color:${INK}">${html}</p>`;
  const h = (text: string) => `<p style="margin:24px 0 8px;font:600 15px/1.4 ${FONT};color:${INK}">${escapeHtml(text)}</p>`;
  const li = (html: string) => `<li style="margin:0 0 8px;font:15px/1.6 ${FONT};color:${INK}">${html}</li>`;
  const link = (url: string, label: string) => `<a href="${escapeHtml(url)}" style="color:${INK};text-decoration:underline">${escapeHtml(label)}</a>`;
  const button = (url: string, label: string) =>
    `<p style="margin:4px 0 16px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:11px 20px;border-radius:6px;background:${ORANGE};color:#ffffff;font:600 15px/1 ${FONT};text-decoration:none">${escapeHtml(label)}</a></p>`;
  const logo = m.logoUrl
    ? `<td width="44" style="padding-right:14px;vertical-align:middle"><img src="${escapeHtml(m.logoUrl)}" width="35" height="45" alt="" style="display:block;border:0"></td>`
    : "";

  const body =
    p(`Hoi ${escapeHtml(m.name)},`) +
    p(`Er is een account voor je aangemaakt in de HHC Hardenberg Hub. Je logt in met je e-mailadres <strong>${escapeHtml(m.email)}</strong>.`) +
    h("1. Kies je wachtwoord") +
    p("Klik op de knop hieronder en kies zelf een wachtwoord van minimaal 8 tekens.") +
    button(m.setPasswordUrl, "Wachtwoord instellen") +
    `<p style="margin:0 0 16px;font:13px/1.6 ${FONT};color:${MUTED}">Deze link werkt één keer en is geldig tot en met ${escapeHtml(m.linkValidUntil)}. Verlopen? Vraag via “Wachtwoord vergeten?” op de inlogpagina een nieuwe link aan.</p>` +
    h("2. Log in") +
    p(`Ga naar ${link(m.hubUrl, m.hubUrl.replace(/^https?:\/\//, ""))} en log in met je e-mailadres en het wachtwoord dat je net hebt gekozen.`) +
    h("3. Zet tweestapsverificatie aan") +
    p("Om je account goed te beveiligen vragen we je om tweestapsverificatie in te stellen. Daarvoor heb je een authenticator-app op je telefoon nodig, bijvoorbeeld Google Authenticator of Microsoft Authenticator.") +
    `<ol style="margin:0 0 16px;padding-left:22px">` +
    li(`Ga in de Hub naar ${link(securityUrl, "Account › Beveiliging")}.`) +
    li("Klik op “Authenticator-app toevoegen” en scan de QR-code met je authenticator-app.") +
    li("Vul de code van 6 cijfers uit de app in om het af te ronden.") +
    li("Bewaar de herstelcodes die je daarna krijgt op een veilige plek. Daarmee kom je nog binnen als je je telefoon kwijt bent.") +
    `</ol>` +
    p("Vanaf dan vraagt de Hub bij het inloggen, na je wachtwoord, om de code die op dat moment in je authenticator-app staat.") +
    p("Vragen of lukt het niet? Neem contact op met de beheerder van de Hub.");

  const html =
    `<!doctype html><html lang="nl"><body style="margin:0;padding:0;background:${PAGE_BG}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">` +
    `<tr><td style="height:4px;line-height:4px;font-size:0;background:${ORANGE}">&nbsp;</td></tr>` +
    `<tr><td style="padding:24px 32px 18px;border-bottom:1px solid #ece9e3"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${logo}` +
    `<td style="vertical-align:middle;font:600 16px/1.3 ${FONT};color:${INK};letter-spacing:.2px">HHC Hardenberg Hub</td></tr></table></td></tr>` +
    `<tr><td style="padding:28px 32px 4px">${body}</td></tr>` +
    `<tr><td style="padding:0 32px 28px;font:14px/1.6 ${FONT};color:${INK}">Met sportieve groet,<br><strong>HHC Hardenberg</strong></td></tr>` +
    `<tr><td style="padding:18px 32px;background:#faf9f7;border-top:1px solid #ece9e3;font:12px/1.6 ${FONT};color:${MUTED}">` +
    `Je ontvangt deze e-mail omdat er een account voor je is aangemaakt in de HHC Hardenberg Hub. Verwachtte je dit niet? Laat het dan weten aan de beheerder van de Hub.</td></tr>` +
    `</table></td></tr></table></body></html>`;

  const text = [
    `Hoi ${m.name},`,
    `Er is een account voor je aangemaakt in de HHC Hardenberg Hub. Je logt in met je e-mailadres ${m.email}.`,
    `1. Kies je wachtwoord\nOpen deze link en kies zelf een wachtwoord van minimaal 8 tekens:\n${m.setPasswordUrl}\nDeze link werkt één keer en is geldig tot en met ${m.linkValidUntil}. Verlopen? Vraag via "Wachtwoord vergeten?" op ${loginUrl} een nieuwe link aan.`,
    `2. Log in\nGa naar ${m.hubUrl} en log in met je e-mailadres en het wachtwoord dat je net hebt gekozen.`,
    `3. Zet tweestapsverificatie aan\nDaarvoor heb je een authenticator-app op je telefoon nodig, bijvoorbeeld Google Authenticator of Microsoft Authenticator.\n- Ga in de Hub naar Account > Beveiliging (${securityUrl}).\n- Klik op "Authenticator-app toevoegen" en scan de QR-code met je authenticator-app.\n- Vul de code van 6 cijfers uit de app in om het af te ronden.\n- Bewaar de herstelcodes op een veilige plek. Daarmee kom je nog binnen als je je telefoon kwijt bent.\nVanaf dan vraagt de Hub bij het inloggen, na je wachtwoord, om de code die op dat moment in je authenticator-app staat.`,
    `Vragen of lukt het niet? Neem contact op met de beheerder van de Hub.`,
    `Met sportieve groet,\nHHC Hardenberg`,
    `--\nJe ontvangt deze e-mail omdat er een account voor je is aangemaakt in de HHC Hardenberg Hub. Verwachtte je dit niet? Laat het dan weten aan de beheerder van de Hub.`,
  ].join("\n\n");

  return { subject: "Welkom bij de HHC Hardenberg Hub", html, text };
}
