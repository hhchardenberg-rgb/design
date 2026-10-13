
-- CreateTable
CREATE TABLE "commercial_invoice_settings" (
    "id" TEXT NOT NULL,
    "legalName" TEXT,
    "street" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "kvkNumber" TEXT,
    "vatNumber" TEXT,
    "iban" TEXT,
    "paymentTermDays" INTEGER,
    "invoicePrefix" TEXT,
    "nextInvoiceNumber" INTEGER,
    "creditPrefix" TEXT,
    "nextCreditNumber" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_invoice_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_invoices" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'INVOICE',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "companyId" TEXT NOT NULL,
    "contractId" TEXT,
    "creditedInvoiceId" TEXT,
    "number" TEXT,
    "issuedOn" DATE,
    "dueOn" DATE,
    "deliveryText" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerAddress" TEXT,
    "buyerVatNumber" TEXT,
    "reference" TEXT,
    "supplierSnapshot" JSONB,
    "issuedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCents" INTEGER NOT NULL,
    "vatRateBp" INTEGER,

    CONSTRAINT "commercial_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidOn" DATE NOT NULL,
    "note" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commercial_invoices_number_key" ON "commercial_invoices"("number");

-- CreateIndex
CREATE INDEX "commercial_invoices_companyId_idx" ON "commercial_invoices"("companyId");

-- CreateIndex
CREATE INDEX "commercial_invoices_creditedInvoiceId_idx" ON "commercial_invoices"("creditedInvoiceId");

-- CreateIndex
CREATE INDEX "commercial_invoices_status_kind_idx" ON "commercial_invoices"("status", "kind");

-- CreateIndex
CREATE INDEX "commercial_invoice_lines_invoiceId_idx" ON "commercial_invoice_lines"("invoiceId");

-- CreateIndex
CREATE INDEX "commercial_payments_invoiceId_idx" ON "commercial_payments"("invoiceId");

-- AddForeignKey
ALTER TABLE "commercial_invoice_lines" ADD CONSTRAINT "commercial_invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "commercial_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_payments" ADD CONSTRAINT "commercial_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "commercial_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

