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
