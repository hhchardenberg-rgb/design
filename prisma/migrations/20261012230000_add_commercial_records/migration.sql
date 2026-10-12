-- CreateEnum
CREATE TYPE "CommercialScope" AS ENUM ('OWN', 'TEAM', 'ALL');

-- CreateEnum
CREATE TYPE "CommercialActivityKind" AS ENUM ('CALL', 'VISIT', 'MEETING', 'EMAIL', 'WHATSAPP', 'QUOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "CommercialActivityNature" AS ENUM ('NOTE', 'PROVISIONAL', 'FORMAL');

-- CreateEnum
CREATE TYPE "CommercialTaskStatus" AS ENUM ('OPEN', 'DONE');

-- CreateEnum
CREATE TYPE "CommercialTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateTable
CREATE TABLE "commercial_member_scopes" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "scope" "CommercialScope" NOT NULL,

    CONSTRAINT "commercial_member_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_team_members" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "commercial_team_members_pkey" PRIMARY KEY ("teamId","userId")
);

-- CreateTable
CREATE TABLE "commercial_companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeName" TEXT,
    "nameKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROSPECT',
    "street" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT,
    "website" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "kvkNumber" TEXT,
    "vatNumber" TEXT,
    "billingName" TEXT,
    "billingEmail" TEXT,
    "billingAddress" TEXT,
    "industry" TEXT,
    "tags" TEXT[],
    "sponsorCategory" TEXT,
    "source" TEXT,
    "internalNotes" TEXT,
    "ownerId" TEXT,
    "teamId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_contacts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_activities" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT,
    "kind" "CommercialActivityKind" NOT NULL,
    "nature" "CommercialActivityNature" NOT NULL DEFAULT 'NOTE',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "isPlanned" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT NOT NULL,
    "followUp" TEXT,
    "authorId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "createdById" TEXT,
    "teamId" TEXT,
    "dueAt" TIMESTAMP(3),
    "priority" "CommercialTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "CommercialTaskStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "companyId" TEXT,
    "activityId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commercial_member_scopes_membershipId_area_key" ON "commercial_member_scopes"("membershipId", "area");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_teams_name_key" ON "commercial_teams"("name");

-- CreateIndex
CREATE INDEX "commercial_team_members_userId_idx" ON "commercial_team_members"("userId");

-- CreateIndex
CREATE INDEX "commercial_companies_nameKey_idx" ON "commercial_companies"("nameKey");

-- CreateIndex
CREATE INDEX "commercial_companies_kvkNumber_idx" ON "commercial_companies"("kvkNumber");

-- CreateIndex
CREATE INDEX "commercial_companies_ownerId_idx" ON "commercial_companies"("ownerId");

-- CreateIndex
CREATE INDEX "commercial_companies_teamId_idx" ON "commercial_companies"("teamId");

-- CreateIndex
CREATE INDEX "commercial_companies_archivedAt_idx" ON "commercial_companies"("archivedAt");

-- CreateIndex
CREATE INDEX "commercial_contacts_companyId_idx" ON "commercial_contacts"("companyId");

-- CreateIndex
CREATE INDEX "commercial_activities_companyId_occurredAt_idx" ON "commercial_activities"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "commercial_tasks_assigneeId_status_idx" ON "commercial_tasks"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "commercial_tasks_companyId_idx" ON "commercial_tasks"("companyId");

-- CreateIndex
CREATE INDEX "commercial_tasks_teamId_idx" ON "commercial_tasks"("teamId");

-- CreateIndex
CREATE INDEX "commercial_tasks_dueAt_idx" ON "commercial_tasks"("dueAt");

-- AddForeignKey
ALTER TABLE "commercial_member_scopes" ADD CONSTRAINT "commercial_member_scopes_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "commercial_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_team_members" ADD CONSTRAINT "commercial_team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "commercial_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_team_members" ADD CONSTRAINT "commercial_team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_companies" ADD CONSTRAINT "commercial_companies_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "commercial_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_contacts" ADD CONSTRAINT "commercial_contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "commercial_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_activities" ADD CONSTRAINT "commercial_activities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "commercial_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_activities" ADD CONSTRAINT "commercial_activities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "commercial_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_tasks" ADD CONSTRAINT "commercial_tasks_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "commercial_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_tasks" ADD CONSTRAINT "commercial_tasks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "commercial_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_tasks" ADD CONSTRAINT "commercial_tasks_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "commercial_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

