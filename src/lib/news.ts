// Eén nieuwsmodule voor alle onderdelen. Edge-safe (geen Prisma-imports) zodat dit ook in
// client-componenten gebruikt kan worden. Een bericht kan bij één of meer onderdelen staan
// en is alleen zichtbaar voor wie toegang heeft tot een van die onderdelen.

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

export interface NewsRights {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canToggle: boolean;
}

export type NewsRightsMap = Record<NewsSection, NewsRights>;
