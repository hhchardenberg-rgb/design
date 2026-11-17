/**
 * Maakt een zoekterm letterlijk voor Prisma `contains`/`startsWith`/`endsWith` en voor `equals` met
 * `mode: "insensitive"`: op Postgres worden dat LIKE/ILIKE-patronen en Prisma escapet `%` en `_`
 * niet zelf. Zonder dit vindt "%%%" of "%@%.%%" elk ticket. Een nul-teken kan nooit in een
 * tekstkolom staan (Postgres weigert het) en wordt weggelaten.
 */
export function likeLiteral(term: string): string {
  return term.replace(/\u0000/g, "").replace(/[\\%_]/g, "\\$&");
}

/** Hoofdletters en accenten weg ("Müller" en "muller" worden hetzelfde), voor zoeken zonder database-extensies. Eén teken blijft één teken. */
const EXTRA_FOLD: Record<string, string> = { ø: "o", đ: "d", ł: "l", ð: "d", ı: "i", Ø: "o", Đ: "d", Ł: "l", Ð: "d" };
export function foldText(s: string): string {
  return Array.from(s)
    .map((c) => EXTRA_FOLD[c] ?? c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase())
    .join("");
}
const FOLD_SOURCE = "àáâãäåāăąçćĉčďđèéêëēĕėęěĝğģĥìíîïĩīĭįıĵķĺļľłñńņňòóôõöøōŏőŕŗřśŝşšţťùúûüũūŭůűųŵýÿŷźżžðÀÁÂÃÄÅĀĂĄÇĆĈČĎĐÈÉÊËĒĔĖĘĚĜĞĢĤÌÍÎÏĨĪĬĮİĴĶĹĻĽŁÑŃŅŇÒÓÔÕÖØŌŎŐŔŖŘŚŜŞŠŢŤÙÚÛÜŨŪŬŮŰŲŴÝŸŶŹŻŽÐ";
/** Parameters voor SQL `translate(kolom, from, to)`: dezelfde vouwing als foldText, voor tekens met een accent. */
export const FOLD_SQL = { from: FOLD_SOURCE, to: Array.from(FOLD_SOURCE).map((c) => foldText(c)).join("") };
