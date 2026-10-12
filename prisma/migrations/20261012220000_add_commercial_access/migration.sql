-- CreateEnum
CREATE TYPE "CommercialOverrideEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateTable
CREATE TABLE "commercial_roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_permission_overrides" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "effect" "CommercialOverrideEffect" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_audit_events" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "targetUserId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commercial_roles_key_key" ON "commercial_roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_memberships_userId_key" ON "commercial_memberships"("userId");

-- CreateIndex
CREATE INDEX "commercial_memberships_roleId_idx" ON "commercial_memberships"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_permission_overrides_membershipId_permission_key" ON "commercial_permission_overrides"("membershipId", "permission");

-- CreateIndex
CREATE INDEX "commercial_audit_events_createdAt_idx" ON "commercial_audit_events"("createdAt");

-- CreateIndex
CREATE INDEX "commercial_audit_events_targetUserId_createdAt_idx" ON "commercial_audit_events"("targetUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "commercial_memberships" ADD CONSTRAINT "commercial_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_memberships" ADD CONSTRAINT "commercial_memberships_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "commercial_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_permission_overrides" ADD CONSTRAINT "commercial_permission_overrides_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "commercial_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

