/*
  Warnings:

  - A unique constraint covering the columns `[quotationId,insightType]` on the table `AIInsight` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AIInsight_quotationId_insightType_key" ON "AIInsight"("quotationId", "insightType");
