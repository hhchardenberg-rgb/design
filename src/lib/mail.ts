import { Resend } from "resend";

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

  await resend.emails.send({
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
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
