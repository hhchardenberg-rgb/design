-- AlterTable
ALTER TABLE "generated_designs" ADD COLUMN "previewUrl" TEXT,
ADD COLUMN "previewKey" TEXT,
ADD COLUMN "previewRevision" INTEGER;

-- AlterTable
ALTER TABLE "templates" ADD COLUMN "thumbnailStamp" TEXT;
