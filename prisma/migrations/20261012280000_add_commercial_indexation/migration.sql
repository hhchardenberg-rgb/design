-- AlterTable
ALTER TABLE "commercial_contracts" ADD COLUMN     "indexationId" TEXT;

-- CreateTable
CREATE TABLE "commercial_indexations" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "basisPoints" INTEGER NOT NULL,
    "roundingCents" INTEGER NOT NULL,
    "contractCount" INTEGER NOT NULL,
    "appliedById" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_indexations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_indexations_seasonId_idx" ON "commercial_indexations"("seasonId");

