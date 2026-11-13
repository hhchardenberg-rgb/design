import { Resend } from "resend";
import { unsubscribeParams } from "@/lib/commercial/mail-security";
import { renderContractNotice, renderMailing, type ContractNotice } from "@/lib/commercial/mail-render";
import { formatDay } from "@/lib/date-format";
import { renderWelcomeMail } from "@/lib/welcome-mail-render";

// Zelfde manier van URL-opbouw als src/lib/webauthn/rp.ts: afgeleid van
// NEXTAUTH_URL (server-geconfigureerd), niet van request-headers.
const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

// RESEND_FROM_EMAIL wordt door de Resend-integratie zelf niet automatisch
// gezet (die zet alleen RESEND_API_KEY) — totdat het afzenderdomein
// geverifieerd is, valt dit terug op Resend's eigen testdomein, dat zonder
// extra configuratie al werkt voor verzending.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "HHC Hardenberg Hub <onboarding@resend.dev>";

/**
 * Vanuit een preview gaat nooit echte e-mail de deur uit: een preview deelt de database met
 * productie, dus een test zou anders echte sponsoren, leden of gebruikers mailen. Alleen als
 * PREVIEW_MAIL_TO is ingesteld, gaat alles naar dat ene testadres (onderwerp met [PREVIEW]).
 */
export const isPreviewDeployment = () => process.env.VERCEL_ENV === "preview";

export class PreviewMailBlocked extends Error {
  constructor() {
    super("Vanuit een preview wordt geen echte e-mail verstuurd.");
  }
}

type SendPayload = Parameters<Resend["emails"]["send"]>[0];

function guardPreview(payload: SendPayload): SendPayload {
  if (!isPreviewDeployment()) return payload;
  const to = process.env.PREVIEW_MAIL_TO;
  if (!to) throw new PreviewMailBlocked();
  const p = payload as SendPayload & { cc?: unknown; bcc?: unknown; subject?: string };
  return { ...p, to, cc: undefined, bcc: undefined, subject: `[PREVIEW] ${p.subject ?? ""}` } as SendPayload;
}

function getClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is niet ingesteld — koppel de Resend-integratie via Vercel voordat e-mail verstuurd kan worden."
    );
  }
  const client = new Resend(apiKey);
  // Elke verzending loopt via de previewbewaking hierboven.
  const send = client.emails.send.bind(client.emails);
  client.emails.send = ((payload: SendPayload, options?: Parameters<Resend["emails"]["send"]>[1]) => send(guardPreview(payload), options)) as Resend["emails"]["send"];
  return client;
}

export async function sendPasswordResetEmail(to: string, name: string, token: string): Promise<void> {
  const resend = getClient();
  const resetUrl = `${APP_URL}/wachtwoord-resetten/${token}`;

  // De Resend-SDK gooit bij een API-fout niet zelf, maar geeft { error } terug.
  // Zonder deze controle lijkt een geweigerde mail (bv. 403 omdat het
  // testdomein alleen naar het adres van de Resend-eigenaar mag sturen)
  // gewoon geslaagd en blijft er niets in de logs achter.
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Wachtwoord resetten — HHC Hardenberg Hub",
    html: `
      <p>Hoi ${escapeHtml(name)},</p>
      <p>Er is een verzoek binnengekomen om het wachtwoord van je account bij de HHC Hardenberg Hub te resetten.</p>
      <p><a href="${resetUrl}">Klik hier om een nieuw wachtwoord in te stellen</a></p>
      <p>Deze link is 1 uur geldig en werkt maar één keer.</p>
      <p>Heb je dit niet zelf aangevraagd? Dan kun je deze e-mail gewoon negeren — er verandert niets aan je account.</p>
    `,
  });
  if (error) {
    throw new Error(`Resend weigerde de e-mail (${error.name}): ${error.message}`);
  }
}

/** Welkomstmail voor een nieuw account, met een instellink in plaats van een wachtwoord (zie src/lib/welcome.server.ts). */
export async function sendWelcomeEmail(to: string, name: string, token: string, expiresAt: Date): Promise<void> {
  const resend = getClient();
  const { subject, html, text } = welcomeMailFor(to, name, token, expiresAt);
  const { error } = await resend.emails.send({ from: FROM_EMAIL, to, subject, html, text });
  if (error) throw new Error(`Resend weigerde de e-mail (${error.name}): ${error.message}`);
}

export function welcomeMailFor(email: string, name: string, token: string, expiresAt: Date) {
  return renderWelcomeMail({
    name,
    email,
    setPasswordUrl: `${APP_URL}/wachtwoord-resetten/${token}`,
    linkValidUntil: formatDay(expiresAt),
    hubUrl: APP_URL,
    logoUrl: `${APP_URL}/branding/hhc-logo.png`,
  });
}

/**
 * Herinneringsmail van Commerciële Zaken (frequentie per persoon instelbaar). Bevat bewust alleen taaktitels,
 * sponsornamen en datums: geen bedragen of dossierinhoud.
 */
export async function sendCommercialDigestEmail(
  to: string,
  name: string,
  digest: { tasks: { title: string; companyName: string | null; dueOn: string }[]; notices: { companyName: string; noticeOn: string; daysLeft: number }[]; contacts: { companyName: string; lastContactOn: string | null; daysSince: number }[] },
): Promise<void> {
  const resend = getClient();
  const taskRows = digest.tasks.map((t) => `<li>${escapeHtml(t.title)}${t.companyName ? ` (${escapeHtml(t.companyName)})` : ""}, uiterlijk ${escapeHtml(formatDay(t.dueOn))}</li>`).join("");
  const noticeRows = digest.notices.map((n) => `<li>${escapeHtml(n.companyName)}: opzegdatum ${escapeHtml(formatDay(n.noticeOn))} (nog ${n.daysLeft} dag${n.daysLeft === 1 ? "" : "en"})</li>`).join("");
  const contactRows = digest.contacts.map((c) => `<li>${escapeHtml(c.companyName)}: ${c.lastContactOn ? `laatste contact op ${escapeHtml(formatDay(c.lastContactOn))} (${c.daysSince} dagen geleden)` : "nog geen contactmoment vastgelegd"}</li>`).join("");
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Herinneringen Commerciële Zaken — HHC Hardenberg Hub",
    html: `
      <p>Hoi ${escapeHtml(name)},</p>
      ${taskRows ? `<p>Deze taken vragen je aandacht:</p><ul>${taskRows}</ul>` : ""}
      ${noticeRows ? `<p>Deze opzegdata komen eraan:</p><ul>${noticeRows}</ul>` : ""}
      ${contactRows ? `<p>Met deze sponsoren is al een tijd geen contact geweest:</p><ul>${contactRows}</ul>` : ""}
      <p><a href="${APP_URL}/commercieel/taken">Open Commerciële Zaken</a></p>
    `,
  });
  if (error) throw new Error(`Resend weigerde de e-mail (${error.name}): ${error.message}`);
}

/**
 * Eén mailing-bericht aan een sponsorcontact. Elke mail bevat een afmeldlink (ook als List-Unsubscribe-header
 * met one-click) en een korte afzenderregel; er worden geen juridische gegevens verzonnen.
 */
export async function sendMailingEmail(mail: { to: string; name: string | null; subject: string; bodyText: string }): Promise<{ providerMessageId: string | null }> {
  const resend = getClient();
  const { e, t } = unsubscribeParams(mail.to);
  const unsubscribeUrl = `${APP_URL}/afmelden?e=${e}&t=${t}`;
  const { html, text } = renderMailing(mail.bodyText, mail.name, unsubscribeUrl, { logoUrl: `${APP_URL}/branding/hhc-logo.png` });
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: mail.to,
    subject: mail.subject,
    html,
    text,
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  if (error) throw new Error(`Resend weigerde de e-mail (${error.name}): ${error.message}`);
  return { providerMessageId: data?.id ?? null };
}

/** Ticketmail met een persoonlijke link. Zakelijk bericht aan één ontvanger, zonder afmeldlink. */
export async function sendTicketEmail(mail: { to: string; subject: string; bodyText: string; linkUrl: string; buttonLabel?: string; banner?: { title: string; text: string | null; buttonLabel: string; url: string } }): Promise<{ providerMessageId: string | null }> {
  const resend = getClient();
  const paragraphs = mail.bodyText.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  const b = mail.banner;
  const bannerHtml = b
    ? `<div style="margin:28px 0 0;padding:16px;border:1px solid #e5e5e5;border-radius:8px"><p style="margin:0 0 4px;font-size:11px;color:#777;text-transform:uppercase;letter-spacing:.05em">Aangeboden door een sponsor</p><p style="margin:0 0 6px;font-weight:bold;font-size:16px">${escapeHtml(b.title)}</p>${b.text ? `<p style="margin:0 0 12px">${escapeHtml(b.text)}</p>` : ""}<a href="${b.url}" style="color:#f26a21;font-weight:bold">${escapeHtml(b.buttonLabel)}</a></div>`
    : "";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:560px">${paragraphs}<p style="margin:22px 0"><a href="${mail.linkUrl}" style="background:#f26a21;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold">${escapeHtml(mail.buttonLabel ?? "Bekijk je ticket")}</a></p>${bannerHtml}</div>`;
  const { data, error } = await resend.emails.send({ from: FROM_EMAIL, to: mail.to, subject: mail.subject, html, text: mail.bodyText + (b ? `\n\n${b.title}${b.text ? `\n${b.text}` : ""}\n${b.url}` : "") });
  if (error) throw new Error(`Resend weigerde de e-mail (${error.name}): ${error.message}`);
  return { providerMessageId: data?.id ?? null };
}

/** Melding dat er een nieuw sponsorcontract is afgesloten (zie src/lib/commercial/notifications.server.ts). */
export async function sendContractNoticeEmail(to: string, notice: Omit<ContractNotice, "url"> & { path: string }): Promise<void> {
  const resend = getClient();
  const { path, ...rest } = notice;
  const { subject, html, text } = renderContractNotice({ ...rest, url: `${APP_URL}${path}` }, { logoUrl: `${APP_URL}/branding/hhc-logo.png` });
  const { error } = await resend.emails.send({ from: FROM_EMAIL, to, subject, html, text });
  if (error) throw new Error(`Resend weigerde de e-mail (${error.name}): ${error.message}`);
}

/**
 * Een factuur of creditnota per e-mail, met de pdf als bijlage. Dit is een zakelijk bericht aan één
 * ontvanger (geen mailing), dus zonder afmeldlink.
 */
export async function sendInvoiceEmail(mail: { to: string; subject: string; bodyText: string; filename: string; pdf: Buffer; replyTo?: string }): Promise<{ providerMessageId: string | null }> {
  const resend = getClient();
  const html = mail.bodyText.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: mail.to,
    subject: mail.subject,
    html,
    text: mail.bodyText,
    replyTo: mail.replyTo,
    attachments: [{ filename: mail.filename, content: mail.pdf }],
  });
  if (error) throw new Error(`Resend weigerde de e-mail (${error.name}): ${error.message}`);
  return { providerMessageId: data?.id ?? null };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Waarschuwing aan de hoofdadmins dat de automatische back-up mislukt is (zie src/lib/backup). */
export async function sendBackupFailedEmail(to: string, name: string, info: { when: string; error: string }): Promise<void> {
  const resend = getClient();
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Back-up mislukt — HHC Hardenberg Hub",
    html: `
      <p>Hoi ${escapeHtml(name)},</p>
      <p>De back-up van ${escapeHtml(info.when)} is mislukt. De gegevens zelf zijn niet aangetast, maar er is van vandaag geen nieuwe kopie.</p>
      <p>Foutmelding: <code>${escapeHtml(info.error)}</code></p>
      <p><a href="${APP_URL}/admin/backups">Open Back-ups in de Hub</a> om het opnieuw te proberen.</p>
    `,
  });
  if (error) throw new Error(`Resend weigerde de e-mail (${error.name}): ${error.message}`);
}

/** Melding aan de eigenaar van een account: er is ingelogd vanaf een apparaat dat we nog niet kenden. */
export async function sendNewDeviceEmail(to: string, name: string, info: { when: string; device: string; ip: string }): Promise<void> {
  const resend = getClient();
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Nieuwe inlog op je account — HHC Hardenberg Hub",
    html: `
      <p>Hoi ${escapeHtml(name)},</p>
      <p>Op ${escapeHtml(info.when)} is op je account ingelogd vanaf een nieuw apparaat: <strong>${escapeHtml(info.device)}</strong> (IP-adres ${escapeHtml(info.ip)}).</p>
      <p>Was jij dit? Dan hoef je niets te doen.</p>
      <p>Was jij dit niet? Wijzig dan direct je wachtwoord via <a href="${APP_URL}/account/profiel">je profiel</a>; daarmee word je overal uitgelogd. Licht ook de hoofdadmin in.</p>
    `,
  });
  if (error) throw new Error(`Resend weigerde de e-mail (${error.name}): ${error.message}`);
}

/** Melding aan de eigenaar van een account: er is te vaak een verkeerd wachtwoord of verkeerde code geprobeerd. */
export async function sendLoginLockedEmail(to: string, name: string, info: { when: string; attempts: number; ip: string }): Promise<void> {
  const resend = getClient();
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Mislukte inlogpogingen op je account — HHC Hardenberg Hub",
    html: `
      <p>Hoi ${escapeHtml(name)},</p>
      <p>Op ${escapeHtml(info.when)} is ${info.attempts} keer achter elkaar tevergeefs geprobeerd in te loggen op je account (laatste poging vanaf IP-adres ${escapeHtml(info.ip)}). Inloggen is daarom een kwartier geblokkeerd.</p>
      <p>Was jij dit? Dan kun je het over een kwartier opnieuw proberen, of je wachtwoord herstellen via <a href="${APP_URL}/wachtwoord-vergeten">wachtwoord vergeten</a>.</p>
      <p>Was jij dit niet? Dan probeert iemand anders binnen te komen. Zorg voor een sterk wachtwoord en zet tweestapsverificatie aan via <a href="${APP_URL}/account/security">accountbeveiliging</a>.</p>
    `,
  });
  if (error) throw new Error(`Resend weigerde de e-mail (${error.name}): ${error.message}`);
}
