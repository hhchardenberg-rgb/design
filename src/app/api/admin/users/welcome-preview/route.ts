import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";
import { welcomeMailFor } from "@/lib/mail";

/** Voorbeeld van de welkomstmail met voorbeeldgegevens; er wordt niets aangemaakt of verstuurd. */
export async function GET() {
  try {
    await requireAdmin();
    const { html } = welcomeMailFor("voorbeeld@hhc-hardenberg.nl", "Voorbeeld Gebruiker", "voorbeeld-link", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
