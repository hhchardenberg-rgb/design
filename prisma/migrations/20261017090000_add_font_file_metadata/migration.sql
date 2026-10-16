-- Metadata uit het fontbestand zelf; alle kolommen optioneel (additief).
ALTER TABLE "fonts" ADD COLUMN "fileFamily" TEXT;
ALTER TABLE "fonts" ADD COLUMN "subfamily" TEXT;
ALTER TABLE "fonts" ADD COLUMN "postscriptName" TEXT;
ALTER TABLE "fonts" ADD COLUMN "sha256" TEXT;
ALTER TABLE "fonts" ADD COLUMN "unitsPerEm" INTEGER;
ALTER TABLE "fonts" ADD COLUMN "ascender" INTEGER;
ALTER TABLE "fonts" ADD COLUMN "descender" INTEGER;
ALTER TABLE "fonts" ADD COLUMN "capHeight" INTEGER;
ALTER TABLE "fonts" ADD COLUMN "metadataReadAt" TIMESTAMP(3);
CREATE INDEX "fonts_postscriptName_idx" ON "fonts"("postscriptName");
