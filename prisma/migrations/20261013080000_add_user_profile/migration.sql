-- AlterTable
ALTER TABLE "users" ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "notifyCommercialDigest" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone" TEXT;

