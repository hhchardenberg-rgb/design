-- Eén rollensysteem voor de hele Hub. Alleen additief: bestaande kolommen en tabellen blijven staan.
CREATE TABLE "access_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "hubLevel" TEXT NOT NULL DEFAULT 'NONE',
    "ticketingLevel" TEXT NOT NULL DEFAULT 'NONE',
    "commercialRoleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "access_roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "access_roles_name_key" ON "access_roles"("name");
CREATE UNIQUE INDEX "access_roles_commercialRoleId_key" ON "access_roles"("commercialRoleId");
ALTER TABLE "access_roles" ADD CONSTRAINT "access_roles_commercialRoleId_fkey" FOREIGN KEY ("commercialRoleId") REFERENCES "commercial_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "user_access_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_access_roles_pkey" PRIMARY KEY ("userId","roleId")
);
CREATE INDEX "user_access_roles_roleId_idx" ON "user_access_roles"("roleId");
ALTER TABLE "user_access_roles" ADD CONSTRAINT "user_access_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_access_roles" ADD CONSTRAINT "user_access_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "access_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
