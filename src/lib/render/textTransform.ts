/**
 * Teksttransformatie van een veld (instelling in de builder), toegepast op de
 * getoonde tekst vóór tekstpassing, in preview én export. De ruwe invoer
 * blijft ongewijzigd bewaard. Locale nl-NL zodat bv. "ij" en accenten goed
 * gaan; handmatige regeleinden blijven staan.
 */
export type TextTransformMode = "NONE" | "UPPERCASE" | "LOWERCASE" | "CAPITALIZE";

export function applyTextTransform(value: string, transform: string | undefined): string {
  switch (transform) {
    case "UPPERCASE":
      return value.toLocaleUpperCase("nl-NL");
    case "LOWERCASE":
      return value.toLocaleLowerCase("nl-NL");
    case "CAPITALIZE":
      // Eerste letter van elk woord; letters met accenten tellen mee. De
      // Nederlandse "ij" aan het begin van een woord wordt samen "IJ".
      return value.replace(/(^|[\s\-‐/(“‘"'])(ij|\p{L})/giu, (_m, sep: string, ch: string) =>
        sep + (ch.toLowerCase() === "ij" ? "IJ" : ch.toLocaleUpperCase("nl-NL"))
      );
    default:
      return value;
  }
}
