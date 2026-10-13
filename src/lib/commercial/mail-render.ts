// Opbouw van een mailing-bericht. Gedeeld tussen het echte verzenden (src/lib/mail.ts) en het
// voorbeeld in het scherm, zodat het voorbeeld altijd exact is wat ontvangers krijgen.
// Bewust zonder server-only imports: dit draait ook in de browser.

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderMailing(bodyText: string, name: string | null, unsubscribeUrl: string): { html: string; text: string } {
  const personal = bodyText.replace(/\{\{\s*naam\s*\}\}/gi, name ?? "");
  const html =
    personal.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("") +
    `<hr><p style="font-size:12px;color:#666">Je ontvangt deze e-mail van HHC Hardenberg. <a href="${escapeHtml(unsubscribeUrl)}">Afmelden voor deze mailings</a></p>`;
  const text = `${personal}\n\n--\nJe ontvangt deze e-mail van HHC Hardenberg. Afmelden: ${unsubscribeUrl}`;
  return { html, text };
}
