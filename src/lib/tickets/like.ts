/**
 * Maakt een zoekterm letterlijk voor Prisma `contains`/`startsWith`/`endsWith` en voor `equals` met
 * `mode: "insensitive"`: op Postgres worden dat LIKE/ILIKE-patronen en Prisma escapet `%` en `_`
 * niet zelf. Zonder dit vindt "%%%" of "%@%.%%" elk ticket. Een nul-teken kan nooit in een
 * tekstkolom staan (Postgres weigert het) en wordt weggelaten.
 */
export function likeLiteral(term: string): string {
  return term.replace(/\u0000/g, "").replace(/[\\%_]/g, "\\$&");
}
