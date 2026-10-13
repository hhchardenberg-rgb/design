-- CreateTable
CREATE TABLE "commercial_invoice_deliveries" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "providerMessageId" TEXT,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_invoice_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_invoice_deliveries_invoiceId_idx" ON "commercial_invoice_deliveries"("invoiceId");

-- AddForeignKey
ALTER TABLE "commercial_invoice_deliveries" ADD CONSTRAINT "commercial_invoice_deliveries_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "commercial_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

