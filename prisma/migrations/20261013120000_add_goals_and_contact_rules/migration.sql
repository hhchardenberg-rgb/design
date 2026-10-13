-- CreateTable
CREATE TABLE "commercial_goals" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "targetCents" INTEGER NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_contact_rules" (
    "tier" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_contact_rules_pkey" PRIMARY KEY ("tier")
);

-- CreateIndex
CREATE UNIQUE INDEX "commercial_goals_seasonId_tier_key" ON "commercial_goals"("seasonId", "tier");

