/**
 * Leidt lettertype-metadata (familienaam, gewicht, stijl, weergavenaam) af
 * uit een bestandsnaam, voor de zip-bulkupload op /admin/fonts. Font-
 * leveranciers (Adobe, FontShop/Monotype, etc.) gebruiken vrijwel altijd een
 * voorspelbaar patroon zoals "FF_DIN_Black.otf" of "FF_DIN_Medium_Italic.otf"
 * — dat is betrouwbaarder dan de interne "name"-tabel van het font zelf
 * parsen (die is vaak rommelig/gelokaliseerd), en vereist geen extra
 * font-parsing-dependency.
 */

const WEIGHT_KEYWORDS: [RegExp, number][] = [
  [/extra ?black|ultra ?black/i, 900],
  [/black|heavy/i, 900],
  [/extra ?bold|ultra ?bold/i, 800],
  [/semi ?bold|demi ?bold/i, 600],
  [/bold/i, 700],
  [/medium/i, 500],
  [/extra ?light|ultra ?light/i, 200],
  [/light/i, 300],
  [/thin|hairline/i, 100],
  [/regular|book|normal|roman/i, 400],
];

export interface ParsedFontFilename {
  family: string;
  name: string;
  weight: number;
  style: "normal" | "italic";
}

export function parseFontFilename(filename: string): ParsedFontFilename {
  const withoutExt = filename.replace(/\.(woff2?|ttf|otf)$/i, "");

  const isItalic = /italic|oblique/i.test(withoutExt);
  let weight = 400;
  let weightMatch: RegExpMatchArray | null = null;
  for (const [pattern, w] of WEIGHT_KEYWORDS) {
    const match = withoutExt.match(pattern);
    if (match) {
      weight = w;
      weightMatch = match;
      break;
    }
  }

  const family = withoutExt
    .replace(/italic|oblique/gi, "")
    .replace(weightMatch ? weightMatch[0] : "", "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const weightLabel = WEIGHT_LABELS[weight] ?? "Regular";
  const name = `${family} ${weightLabel}${isItalic ? " Italic" : ""}`.trim();

  return { family, name, weight, style: isItalic ? "italic" : "normal" };
}

const WEIGHT_LABELS: Record<number, string> = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};
