-- AlterTable
ALTER TABLE "generated_designs" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "uploaded_assets" ADD COLUMN     "bytes" INTEGER,
ADD COLUMN     "storageKey" TEXT;

-- CreateTable
CREATE TABLE "design_exports" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "renderKey" TEXT NOT NULL,
    "rendererVersion" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "design_exports_renderKey_key" ON "design_exports"("renderKey");

-- CreateIndex
CREATE INDEX "design_exports_designId_idx" ON "design_exports"("designId");

-- AddForeignKey
ALTER TABLE "design_exports" ADD CONSTRAINT "design_exports_designId_fkey" FOREIGN KEY ("designId") REFERENCES "generated_designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

