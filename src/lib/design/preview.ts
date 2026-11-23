/**
 * Gedeelde instellingen voor voorbeeldafbeeldingen in overzichten
 * (dashboard, Mijn ontwerpen, Hub, templatebibliotheek).
 */

/** Ophogen als voorbeelden er anders uit gaan zien; alles wordt dan opnieuw gemaakt. */
export const PREVIEW_STYLE_VERSION = "2";

/** Vulling voor een afbeeldingskader zonder foto (alleen in voorbeelden). */
export const PREVIEW_EMPTY_IMAGE_FILL = "#7a7a7a";

/** Langste zijde van een voorbeeld in pixels (2x een kaart van ~300 px). */
export const PREVIEW_MAX_SIZE = 640;

export function templateThumbnailStamp(versionId: string) {
  return `${versionId}:${PREVIEW_STYLE_VERSION}`;
}

/** URL van de altijd actuele voorbeeldafbeelding van een opgeslagen ontwerp. */
export function designPreviewSrc(d: { id: string; revision: number }) {
  return `/api/designs/${d.id}/preview?r=${d.revision}-${PREVIEW_STYLE_VERSION}`;
}

/** URL van de miniatuur van een template (vernieuwt zichzelf bij een nieuwe versie). */
export function templateThumbnailSrc(t: { slug: string; activeVersionId: string | null; thumbnailUrl: string | null }) {
  if (!t.activeVersionId) return t.thumbnailUrl;
  return `/api/templates/${encodeURIComponent(t.slug)}/thumbnail?v=${encodeURIComponent(templateThumbnailStamp(t.activeVersionId))}`;
}
