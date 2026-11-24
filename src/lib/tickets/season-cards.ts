import type { RuleTicket } from "./rules";

// Seizoenskaarten en -passen uit Fullhouse. Fullhouse verkoopt die niet per wedstrijd maar op één eigen
// evenement per seizoen ("Seizoenskaarten 2026-27", "Seizoenspassen 2026-27"). De Hub koppelt zo'n
// evenement aan een Hub-seizoen; de kaarten erop gelden dan voor elk thuisduel van dat seizoen, met
// dezelfde regels als een eigen seizoenskaart (uitgesloten duels, herintrede, dubbel scannen). Puur, dus testbaar.

/** Klinkt de naam als een evenement met seizoenskaarten of -passen? */
export const isSeasonCardTitle = (title: string) =>
  /seizoens(kaart|pas)/i.test(title);

/** Geeft dit evenement seizoenskaarten uit? Een keuze van de beheerder gaat voor; anders op naam. */
export function isSeasonCardSource(e: {
  source: string;
  title: string;
  seasonCardSource?: boolean | null;
}): boolean {
  return (
    e.source === "FULLHOUSE" &&
    (e.seasonCardSource ?? isSeasonCardTitle(e.title))
  );
}

/** Prisma-filter met dezelfde betekenis als isSeasonCardSource (alleen bruikbare, niet-gearchiveerde evenementen). */
export const SEASON_CARD_SOURCE_WHERE = {
  source: "FULLHOUSE",
  externalId: { not: null as null },
  archivedAt: null,
  OR: [
    { seasonCardSource: true },
    {
      seasonCardSource: null,
      OR: [
        { title: { contains: "seizoenskaart", mode: "insensitive" as const } },
        { title: { contains: "seizoenspas", mode: "insensitive" as const } },
      ],
    },
  ],
};

/** Een Fullhouse-seizoenskaart als regelticket: geldig voor alle thuisduels van het seizoen. */
export function fullhouseSeasonRuleTicket(seasonId: string | null): RuleTicket {
  return {
    status: "ACTIVE",
    validityMode: "SEASON",
    validFrom: null,
    validUntil: null,
    seasonId,
    competitions: [],
    eventIds: [],
    homeOnly: true,
    isSeasonCard: true,
    zoneId: null,
  };
}

/** Welke van de gevonden kaarten telt: eerst een geldige van het seizoen van het duel, dan een andere van dat seizoen, dan de rest. */
export function pickSeasonCard<
  T extends { status: string; seasonId: string | null },
>(hits: T[], seasonId: string | null): T | null {
  const rank = (h: T) =>
    (seasonId && h.seasonId === seasonId ? 0 : 2) +
    (h.status === "VALID" ? 0 : 1);
  return [...hits].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}
