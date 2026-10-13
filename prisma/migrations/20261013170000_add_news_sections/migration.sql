-- Eén nieuwsmodule voor alle onderdelen (Communicatie, Ticketing, Commerciële Zaken). Alleen
-- additief: bestaande berichten staan bij "hub" (Communicatie).
ALTER TABLE "news_posts" ADD COLUMN "sections" TEXT[] DEFAULT ARRAY['hub']::TEXT[];

CREATE TABLE "news_section_settings" (
    "section" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_section_settings_pkey" PRIMARY KEY ("section")
);
