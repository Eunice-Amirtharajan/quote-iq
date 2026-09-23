-- Step 1: Insert one Client row per distinct (normalised) clientName in Quotation
INSERT INTO "Client" (id, name, "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  LOWER(TRIM("clientName")),
  now(),
  now()
FROM "Quotation"
WHERE "clientName" IS NOT NULL
  AND "clientName" <> ''
GROUP BY LOWER(TRIM("clientName"))
ON CONFLICT ("name") DO NOTHING;

-- Step 2: Backfill clientId FK from the newly created Client rows
UPDATE "Quotation" q
SET "clientId" = c.id
FROM "Client" c
WHERE LOWER(TRIM(q."clientName")) = c.name
  AND q."clientId" IS NULL;

-- Step 3: Enforce NOT NULL on clientId now that every row is filled
ALTER TABLE "Quotation" ALTER COLUMN "clientId" SET NOT NULL;

-- Step 4: Add FK constraint
ALTER TABLE "Quotation"
  ADD CONSTRAINT "Quotation_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 5: Drop the now-redundant clientName column
ALTER TABLE "Quotation" DROP COLUMN "clientName";
