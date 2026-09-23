-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- AlterTable: add nullable clientId first (populated in backfill migration)
ALTER TABLE "Quotation" ADD COLUMN "clientId" TEXT;

-- CreateIndex
CREATE INDEX "Quotation_clientId_idx" ON "Quotation"("clientId");
