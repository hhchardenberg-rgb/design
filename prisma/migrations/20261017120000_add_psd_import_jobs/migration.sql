-- Additief: importrapport per versie en een tabel voor importtaken.
ALTER TABLE "template_versions" ADD COLUMN "importReport" JSONB;

CREATE TABLE "template_import_jobs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "sourceUrl" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "templateId" TEXT,
    "createdById" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "error" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "template_import_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "template_import_jobs_status_idx" ON "template_import_jobs"("status");
