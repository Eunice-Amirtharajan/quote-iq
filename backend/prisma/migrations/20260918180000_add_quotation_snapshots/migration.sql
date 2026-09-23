-- CreateTable
CREATE TABLE "QuotationSnapshot" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuotationSnapshot_quotationId_idx" ON "QuotationSnapshot"("quotationId");

-- AddForeignKey
ALTER TABLE "QuotationSnapshot" ADD CONSTRAINT "QuotationSnapshot_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
