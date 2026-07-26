ALTER TABLE "Quotation" ADD COLUMN "publicToken" TEXT NOT NULL DEFAULT gen_random_uuid()::text;
CREATE UNIQUE INDEX "Quotation_publicToken_key" ON "Quotation"("publicToken");