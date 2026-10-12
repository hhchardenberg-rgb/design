-- CreateTable
CREATE TABLE "commercial_opportunities" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'LEAD',
    "packageId" TEXT,
    "expectedAmountCents" INTEGER,
    "expectedCloseOn" DATE,
    "ownerId" TEXT,
    "lostReason" TEXT,
    "notes" TEXT,
    "wonContractId" TEXT,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_opportunities_companyId_idx" ON "commercial_opportunities"("companyId");

-- CreateIndex
CREATE INDEX "commercial_opportunities_stage_archivedAt_idx" ON "commercial_opportunities"("stage", "archivedAt");

-- CreateIndex
CREATE INDEX "commercial_opportunities_ownerId_idx" ON "commercial_opportunities"("ownerId");

-- AddForeignKey
ALTER TABLE "commercial_opportunities" ADD CONSTRAINT "commercial_opportunities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "commercial_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

