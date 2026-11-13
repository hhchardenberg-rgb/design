/**
 * Featureflag voor Commerciële Zaken.
 *
 * Hoofdschakelaar: zolang COMMERCIAL_SECTION_ACTIVE false is, staat de sectie
 * volledig uit, wat COMMERCIAL_ENABLED in Vercel ook zegt. Uit betekent: geen
 * menu of tegel, geen pagina's of API (404), geen rechten of rollen in
 * Gebruikersbeheer, geen herinneringsmails, geen verwerking van mailwebhooks en
 * geen sponsorbanners in de ticketmail. Code, database en gegevens blijven
 * volledig bewaard; rollen en toewijzingen worden niet aangeraakt.
 *
 * Weer aanzetten: COMMERCIAL_SECTION_ACTIVE op true zetten én in Vercel
 * COMMERCIAL_ENABLED=true laten staan (of zetten).
 *
 * Uitgezet op verzoek van Jermaine op 13/11/2026.
 */
export const COMMERCIAL_SECTION_ACTIVE = false;

export function isCommercialEnabled(): boolean {
  // De (database)tests van CZ draaien met NODE_ENV=test; in een Next-build is NODE_ENV altijd "production".
  const active = COMMERCIAL_SECTION_ACTIVE || process.env.NODE_ENV === "test";
  return active && process.env.COMMERCIAL_ENABLED === "true";
}
