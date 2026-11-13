/**
 * Maximale grootte van een PSD-upload in de designtool. Gedeeld door de
 * browser (nette melding vooraf) en het Blob-token (harde grens bij Vercel
 * Blob zelf).
 *
 * Het uploaden gaat rechtstreeks van de browser naar Vercel Blob, dus de
 * 4,5MB-limiet van een serverfunctie speelt hier niet. De grens komt van
 * het verwerken: een serverfunctie op Vercel heeft 2 GB geheugen, en een
 * PSD van 200 MB vraagt bij het uitpakken van alle lagen al ruim 1,5 GB.
 */
export const MAX_PSD_UPLOAD_MB = 250;
export const MAX_PSD_UPLOAD_BYTES = MAX_PSD_UPLOAD_MB * 1024 * 1024;
