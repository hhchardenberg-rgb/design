-- AlterTable
ALTER TABLE "commercial_contacts" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- DropIndex
DROP INDEX "commercial_contacts_companyId_idx";

-- CreateIndex
CREATE INDEX "commercial_contacts_companyId_position_idx" ON "commercial_contacts"("companyId", "position");

-- Bestaande contactpersonen krijgen per bedrijf een volgorde op aanmaakdatum (1, 2, 3, ...).
UPDATE "commercial_contacts" c SET "position" = r.rn
FROM (SELECT "id", ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id") AS rn FROM "commercial_contacts") r
WHERE c."id" = r."id";
