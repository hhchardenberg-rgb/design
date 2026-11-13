/**
 * Featureflag voor HHC Tickets. Standaard UIT: zolang TICKETS_ENABLED niet exact "true" is,
 * bestaat de sectie niet (menu, pagina's en API geven 404).
 */
export function isTicketsEnabled(): boolean {
  return process.env.TICKETS_ENABLED === "true";
}
