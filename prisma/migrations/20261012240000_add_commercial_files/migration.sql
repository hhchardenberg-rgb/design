CREATE TABLE "commercial_files" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "versionGroup" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "uploadedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_files_companyId_category_idx" ON "commercial_files"("companyId", "category");

-- CreateIndex
CREATE INDEX "commercial_files_versionGroup_idx" ON "commercial_files"("versionGroup");

-- AddForeignKey
ALTER TABLE "commercial_files" ADD CONSTRAINT "commercial_files_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "commercial_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

