import { Resend } from "resend";
import { unsubscribeParams } from "@/lib/commercial/mail-security";
import { renderMailing } from "@/lib/commercial/mail-render";

// Zelfde manier van URL-opbouw als src/lib/webauthn/rp.ts: afgeleid van
// NEXTAUTH_URL (server-geconfigureerd), niet van request-headers.
const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

// RESEND_FROM_EMAIL wordt door de Resend-integratie zelf niet automatisch
// gezet (die zet alleen RESEND_API_KEY) — totdat het afzenderdomein
// geverifieerd is, valt dit terug op Resend's eigen testdomein, dat zonder
// extra configuratie al werkt voor verzending.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "HHC Hardenberg Hub <onboarding@resend.dev>";

function getClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is niet ingesteld — koppel de Resend-integratie via Vercel voordat e-mail verstuurd kan worden."
    );
  }
  return new Resend(apiKey);
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

/**
 * Dagelijkse herinneringsmail van Commerciële Zaken. Bevat bewust alleen taaktitels,
 * sponsornamen en datums: geen bedragen of dossierinhoud.
 */
export async function sendCommercialDigestEmail(
  to: string,
  name: string,
  digest: { tasks: { title: string; companyName: string | null; dueOn: string }[]; notices: { companyName: string; noticeOn: string; daysLeft: number }[]; contacts: { companyName: string; lastContactOn: string | null; daysSince: number }[] },
): Promise<void> {
  const resend = getClient();
  const taskRows = digest.tasks.map((t) => `<li>${escapeHtml(t.title)}${t.companyName ? ` (${escapeHtml(t.companyName)})` : ""}, uiterlijk ${escapeHtml(t.dueOn)}</li>`).join("");
  const noticeRows = digest.notices.map((n) => `<li>${escapeHtml(n.companyName)}: opzegdatum ${escapeHtml(n.noticeOn)} (nog ${n.daysLeft} dag${n.daysLeft === 1 ? "" : "en"})</li>`).join("");
  const contactRows = digest.contacts.map((c) => `<li>${escapeHtml(c.companyName)}: ${c.lastContactOn ? `laatste contact op ${escapeHtml(c.lastContactOn)} (${c.daysSince} dagen geleden)` : "nog geen contactmoment vastgelegd"}</li>`).join("");
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
