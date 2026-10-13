// Nieuws per onderdeel. Edge-safe (geen Prisma-imports) zodat dit ook in
// client-componenten gebruikt kan worden. Een bericht hoort bij precies één
// onderdeel en is alleen zichtbaar voor wie toegang heeft tot dat onderdeel.

export type NewsSection = "hub" | "ticketing" | "commercial";

export const NEWS_SECTIONS: Record<NewsSection, { label: string; feedHref: string; audience: string }> = {
  hub: { label: "Communicatie", feedHref: "/nieuws", audience: "Team Communicatie" },
  ticketing: { label: "Ticketing", feedHref: "/ticketing/nieuws", audience: "Ticketing" },
  commercial: { label: "Commerciële Zaken", feedHref: "/commercieel/nieuws", audience: "Commerciële Zaken" },
};

export const NEWS_SECTION_KEYS = Object.keys(NEWS_SECTIONS) as NewsSection[];

export function isNewsSection(value: unknown): value is NewsSection {
  return typeof value === "string" && (NEWS_SECTION_KEYS as string[]).includes(value);
}

export type NewsEnabledMap = Record<NewsSection, boolean>;
