
-- CreateTable
CREATE TABLE "commercial_mailings" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "audienceStatus" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_mailings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_mailing_recipients" (
    "id" TEXT NOT NULL,
    "mailingId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),

    CONSTRAINT "commercial_mailing_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_unsubscribes" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_unsubscribes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_mail_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_mail_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_mailings_status_idx" ON "commercial_mailings"("status");

-- CreateIndex
CREATE INDEX "commercial_mailing_recipients_providerMessageId_idx" ON "commercial_mailing_recipients"("providerMessageId");

-- CreateIndex
CREATE INDEX "commercial_mailing_recipients_companyId_idx" ON "commercial_mailing_recipients"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_mailing_recipients_mailingId_email_key" ON "commercial_mailing_recipients"("mailingId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_unsubscribes_email_key" ON "commercial_unsubscribes"("email");

-- AddForeignKey
ALTER TABLE "commercial_mailing_recipients" ADD CONSTRAINT "commercial_mailing_recipients_mailingId_fkey" FOREIGN KEY ("mailingId") REFERENCES "commercial_mailings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

