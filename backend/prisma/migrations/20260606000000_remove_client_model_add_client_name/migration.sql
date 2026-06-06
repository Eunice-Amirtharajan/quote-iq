-- Add clientName column with a default so existing rows are not null-violated
ALTER TABLE "Quotation" ADD COLUMN "clientName" TEXT NOT NULL DEFAULT '';

-- Backfill: copy client name into quotations
UPDATE "Quotation" q
SET "clientName" = c."name"
FROM "Client" c
WHERE q."clientId" = c."id";

-- Drop the FK constraint linking Quotation → Client
ALTER TABLE "Quotation" DROP CONSTRAINT IF EXISTS "Quotation_clientId_fkey";

-- Remove the clientId foreign-key column
ALTER TABLE "Quotation" DROP COLUMN IF EXISTS "clientId";

-- Remove the client relation from User (the User → Client FK)
ALTER TABLE "Client" DROP CONSTRAINT IF EXISTS "Client_createdById_fkey";

-- Drop the clients table entirely
DROP TABLE IF EXISTS "Client";
