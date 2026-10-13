-- AlterTable
ALTER TABLE "users" ADD COLUMN "commercialDigestFrequency" TEXT;

-- CreateTable
CREATE TABLE "commercial_reminder_settings" (
    "id" TEXT NOT NULL,
    "defaultFrequency" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_reminder_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_reminder_mutes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_reminder_mutes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commercial_reminder_mutes_userId_companyId_key" ON "commercial_reminder_mutes"("userId", "companyId");

-- CreateIndex
CREATE INDEX "commercial_reminder_mutes_companyId_idx" ON "commercial_reminder_mutes"("companyId");
