/**
 * Featureflag voor Commerciële Zaken. Standaard UIT: zolang
 * COMMERCIAL_ENABLED niet exact "true" is, bestaat de sectie niet (menu,
 * pagina's en API geven 404) en kan niemand erbij.
 */
export function isCommercialEnabled(): boolean {
  return process.env.COMMERCIAL_ENABLED === "true";
}
