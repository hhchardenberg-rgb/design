-- AlterTable
ALTER TABLE "commercial_companies" ADD COLUMN     "sponsorTier" TEXT;

-- AlterTable
ALTER TABLE "commercial_mailings" ADD COLUMN     "audienceTiers" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "commercial_companies_sponsorTier_idx" ON "commercial_companies"("sponsorTier");


-- Bestaande vrije 'sponsorcategorie' die al een van de vormen noemt, wordt overgenomen (zonder iets te wissen).
UPDATE "commercial_companies" SET "sponsorTier" = CASE lower(trim("sponsorCategory"))
  WHEN 'hoofd' THEN 'HOOFD' WHEN 'hoofdsponsor' THEN 'HOOFD'
  WHEN 'platina' THEN 'PLATINA' WHEN 'goud' THEN 'GOUD' WHEN 'zilver' THEN 'ZILVER' WHEN 'overig' THEN 'OVERIG'
  ELSE NULL END
WHERE "sponsorTier" IS NULL AND "sponsorCategory" IS NOT NULL;
