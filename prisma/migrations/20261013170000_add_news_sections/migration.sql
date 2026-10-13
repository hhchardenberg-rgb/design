-- Nieuws per onderdeel (Communicatie, Ticketing, Commerciële Zaken). Alleen additief:
-- bestaande berichten krijgen het onderdeel "hub" (Communicatie).
ALTER TABLE "news_posts" ADD COLUMN "section" TEXT NOT NULL DEFAULT 'hub';
CREATE INDEX "news_posts_section_pinned_createdAt_idx" ON "news_posts"("section", "pinned", "createdAt");

CREATE TABLE "news_section_settings" (
    "section" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_section_settings_pkey" PRIMARY KEY ("section")
);
