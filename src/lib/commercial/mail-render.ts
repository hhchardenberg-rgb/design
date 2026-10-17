// Opbouw van een mailing-bericht. Gedeeld tussen het echte verzenden (src/lib/mail.ts) en het
// voorbeeld in het scherm, zodat het voorbeeld altijd exact is wat ontvangers krijgen.
// Bewust zonder server-only imports: dit draait ook in de browser.
//
// Opmaak: e-mailveilig (tabellen, inline stijl). Huisstijlkleur oranje (#FF6F00) alleen vol en subtiel
// als accent: een smalle balk bovenin en een lijn onder de kop; verder zwart op wit.

const ORANGE = "#ff6f00";
const INK = "#1a1a1a";
const MUTED = "#6b6659";
const PAGE_BG = "#f7f6f4";
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface RenderOptions {
  /** Absolute URL van het HHC-logo. Zonder logo valt de kop terug op alleen de naam. */
  logoUrl?: string;
}

export function renderMailing(bodyText: string, name: string | null, unsubscribeUrl: string, options: RenderOptions = {}): { html: string; text: string } {
  const personal = bodyText.replace(/\{\{\s*naam\s*\}\}/gi, name ?? "");
  const paragraphs = personal
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;font:15px/1.65 ${FONT};color:${INK}">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const logo = options.logoUrl
    ? `<td width="44" style="padding-right:14px;vertical-align:middle"><img src="${escapeHtml(options.logoUrl)}" width="35" height="45" alt="" style="display:block;border:0"></td>`
    : "";
  const html =
    `<!doctype html><html lang="nl"><body style="margin:0;padding:0;background:${PAGE_BG}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">` +
    `<tr><td style="height:4px;line-height:4px;font-size:0;background:${ORANGE}">&nbsp;</td></tr>` +
    `<tr><td style="padding:24px 32px 18px;border-bottom:1px solid #ece9e3"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${logo}` +
    `<td style="vertical-align:middle;font:600 16px/1.3 ${FONT};color:${INK};letter-spacing:.2px">Voetbalvereniging HHC Hardenberg</td></tr></table></td></tr>` +
    `<tr><td style="padding:28px 32px 12px">${paragraphs}</td></tr>` +
    `<tr><td style="padding:0 32px 28px;font:14px/1.6 ${FONT};color:${INK}">Met sportieve groet,<br><strong>HHC Hardenberg</strong></td></tr>` +
    `<tr><td style="padding:18px 32px;background:#faf9f7;border-top:1px solid #ece9e3;font:12px/1.6 ${FONT};color:${MUTED}">` +
    `Je ontvangt deze e-mail omdat je contactpersoon bent van een sponsor of relatie van HHC Hardenberg.<br>` +
    `<a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline">Afmelden voor deze mailings</a></td></tr>` +
    `</table></td></tr></table></body></html>`;
  const text = `${personal}\n\nMet sportieve groet,\nHHC Hardenberg\n\n--\nJe ontvangt deze e-mail omdat je contactpersoon bent van een sponsor of relatie van HHC Hardenberg. Afmelden: ${unsubscribeUrl}`;
  return { html, text };
}

export interface ContractNotice {
  companyName: string;
  tier: string | null;
  /** "Huidig seizoen", "Aankomend seizoen" of "Afgelopen seizoen". */
  season: string;
  packageName: string | null;
  /** Al opgemaakt als dd/mm/jjjj. */
  startsOn: string;
  endsOn: string;
  actorName: string | null;
  url: string;
}

/**
 * Melding aan aangewezen mensen dat er een nieuw sponsorcontract is afgesloten. Zonder bedragen: de ontvangers
 * hoeven geen bedragenrechten te hebben, en kunnen zelfs buiten de Hub vallen.
 */
export function renderContractNotice(n: ContractNotice, options: RenderOptions = {}): { subject: string; html: string; text: string } {
  const rows: [string, string][] = [
    ["Sponsor", n.companyName],
    ...(n.tier ? ([["Sponsorvorm", n.tier]] as [string, string][]) : []),
    ["Seizoen", n.season],
    ...(n.packageName ? ([["Pakket", n.packageName]] as [string, string][]) : []),
    ["Looptijd", `${n.startsOn} t/m ${n.endsOn}`],
    ...(n.actorName ? ([["Afgesloten door", n.actorName]] as [string, string][]) : []),
  ];
  const intro = `Er is een nieuw sponsorcontract afgesloten met ${n.companyName}.`;
  const table = rows
    .map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;font:14px/1.5 ${FONT};color:${MUTED};white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0;font:600 14px/1.5 ${FONT};color:${INK}">${escapeHtml(v)}</td></tr>`)
    .join("");
  const logo = options.logoUrl
    ? `<td width="44" style="padding-right:14px;vertical-align:middle"><img src="${escapeHtml(options.logoUrl)}" width="35" height="45" alt="" style="display:block;border:0"></td>`
    : "";
  const html =
    `<!doctype html><html lang="nl"><body style="margin:0;padding:0;background:${PAGE_BG}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">` +
    `<tr><td style="height:4px;line-height:4px;font-size:0;background:${ORANGE}">&nbsp;</td></tr>` +
    `<tr><td style="padding:24px 32px 18px;border-bottom:1px solid #ece9e3"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${logo}` +
    `<td style="vertical-align:middle;font:600 16px/1.3 ${FONT};color:${INK};letter-spacing:.2px">Commerciële Zaken · HHC Hardenberg</td></tr></table></td></tr>` +
    `<tr><td style="padding:28px 32px 8px"><p style="margin:0 0 16px;font:15px/1.65 ${FONT};color:${INK}">${escapeHtml(intro)}</p>` +
    `<table role="presentation" cellpadding="0" cellspacing="0">${table}</table></td></tr>` +
    `<tr><td style="padding:16px 32px 28px"><a href="${escapeHtml(n.url)}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:${ORANGE};color:#ffffff;font:600 14px/1 ${FONT};text-decoration:none">Bekijk in de Hub</a></td></tr>` +
    `<tr><td style="padding:18px 32px;background:#faf9f7;border-top:1px solid #ece9e3;font:12px/1.6 ${FONT};color:${MUTED}">` +
    `Je ontvangt deze melding omdat je bent aangewezen om te horen over nieuwe sponsorcontracten. Een beheerder van Commerciële Zaken kan dat aanpassen.</td></tr>` +
    `</table></td></tr></table></body></html>`;
  const text = `${intro}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nBekijk in de Hub: ${n.url}\n\n--\nJe ontvangt deze melding omdat je bent aangewezen om te horen over nieuwe sponsorcontracten. Een beheerder van Commerciële Zaken kan dat aanpassen.`;
  return { subject: `Nieuw sponsorcontract: ${n.companyName}`, html, text };
}
