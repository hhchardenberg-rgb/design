-- CreateTable
CREATE TABLE "social_channels" (
    "platform" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_channels_pkey" PRIMARY KEY ("platform")
);
