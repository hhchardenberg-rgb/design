// Sponsorvormen van HHC Hardenberg, van hoog naar laag. De sleutel staat in de database,
// het label wordt getoond. Bewust zonder server-only imports: ook in de browser te gebruiken.
export const SPONSOR_TIERS = [
  { key: "HOOFD", label: "Hoofd" },
  { key: "PLATINA", label: "Platina" },
  { key: "GOUD", label: "Goud" },
  { key: "ZILVER", label: "Zilver" },
  { key: "OVERIG", label: "Overig" },
] as const;

export type SponsorTier = (typeof SPONSOR_TIERS)[number]["key"];
export const SPONSOR_TIER_KEYS: readonly string[] = SPONSOR_TIERS.map((t) => t.key);

export const isSponsorTier = (v: unknown): v is SponsorTier => typeof v === "string" && SPONSOR_TIER_KEYS.includes(v);
export const tierLabel = (key: string | null | undefined): string | null => SPONSOR_TIERS.find((t) => t.key === key)?.label ?? null;

/** Leest een vorm uit vrije invoer (bijvoorbeeld een importbestand): "Platina", "hoofdsponsor", "GOUD". Onbekend geeft null. */
export function parseTier(input: string | null | undefined): SponsorTier | null {
  const t = (input ?? "").trim().toLowerCase().replace(/sponsor$/, "").trim();
  return SPONSOR_TIERS.find((x) => x.key.toLowerCase() === t || x.label.toLowerCase() === t)?.key ?? null;
}

/** Downloadlink voor de Excel-export van bedrijven met contactpersonen; "NONE" = zonder sponsorvorm, leeg = alle. */
export function contactsExportHref(tiers: readonly string[]): string {
  return `/api/commercial/export?kind=contacts${tiers.map((t) => `&tier=${encodeURIComponent(t)}`).join("")}`;
}
