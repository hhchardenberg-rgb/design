-- Voorbeeldafbeeldingen bij bestanden (logo's) en meldingen bij nieuwe contracten. Alleen additief.
ALTER TABLE "commercial_files" ADD COLUMN "previewKey" TEXT;
ALTER TABLE "commercial_files" ADD COLUMN "previewSource" TEXT;

CREATE TABLE "commercial_notification_recipients" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "name" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "commercial_notification_recipients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "commercial_notification_recipients_event_userId_key" ON "commercial_notification_recipients"("event", "userId");
CREATE UNIQUE INDEX "commercial_notification_recipients_event_email_key" ON "commercial_notification_recipients"("event", "email");

CREATE TABLE "commercial_notification_logs" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "commercial_notification_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "commercial_notification_logs_event_refId_address_key" ON "commercial_notification_logs"("event", "refId", "address");
CREATE INDEX "commercial_notification_logs_refId_idx" ON "commercial_notification_logs"("refId");
