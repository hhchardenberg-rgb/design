-- AlterTable
ALTER TABLE "commercial_companies" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedById" TEXT,
ADD COLUMN "deletedByLabel" TEXT,
ADD COLUMN "deleteReason" TEXT;

-- CreateIndex
CREATE INDEX "commercial_companies_deletedAt_idx" ON "commercial_companies"("deletedAt");
