-- CreateTable
CREATE TABLE "commercial_seasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultAmountCents" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_package_items" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "commercial_package_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_contracts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "packageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "amountCents" INTEGER,
    "renewalOn" DATE,
    "noticeUntil" DATE,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "packageSnapshot" JSONB,
    "renewedFromId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_counterparts" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "dueOn" DATE,
    "deliveredAt" TIMESTAMP(3),
    "responsibleId" TEXT,
    "notes" TEXT,
    "proofFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_counterparts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commercial_seasons_name_key" ON "commercial_seasons"("name");

-- CreateIndex
CREATE INDEX "commercial_package_items_packageId_idx" ON "commercial_package_items"("packageId");

-- CreateIndex
CREATE INDEX "commercial_contracts_companyId_idx" ON "commercial_contracts"("companyId");

-- CreateIndex
CREATE INDEX "commercial_contracts_seasonId_status_idx" ON "commercial_contracts"("seasonId", "status");

-- CreateIndex
CREATE INDEX "commercial_contracts_endsOn_idx" ON "commercial_contracts"("endsOn");

-- CreateIndex
CREATE INDEX "commercial_counterparts_contractId_idx" ON "commercial_counterparts"("contractId");

-- CreateIndex
CREATE INDEX "commercial_counterparts_companyId_idx" ON "commercial_counterparts"("companyId");

-- AddForeignKey
ALTER TABLE "commercial_package_items" ADD CONSTRAINT "commercial_package_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "commercial_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_contracts" ADD CONSTRAINT "commercial_contracts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "commercial_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_contracts" ADD CONSTRAINT "commercial_contracts_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "commercial_seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_contracts" ADD CONSTRAINT "commercial_contracts_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "commercial_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_counterparts" ADD CONSTRAINT "commercial_counterparts_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "commercial_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

