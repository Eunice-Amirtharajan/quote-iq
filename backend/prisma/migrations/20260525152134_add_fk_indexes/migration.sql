-- CreateIndex
CREATE INDEX "AIInsight_quotationId_idx" ON "AIInsight"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");

-- CreateIndex
CREATE INDEX "StatusHistory_quotationId_idx" ON "StatusHistory"("quotationId");
