-- Remove EXPIRED from QuotationStatus enum
-- PostgreSQL does not support ALTER TYPE ... DROP VALUE, so we recreate the type.

-- Step 1: Rename the existing enum
ALTER TYPE "QuotationStatus" RENAME TO "QuotationStatus_old";

-- Step 2: Create the new enum without EXPIRED
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED');

-- Step 3: Drop defaults that reference the old enum before altering columns
ALTER TABLE "Quotation" ALTER COLUMN "status" DROP DEFAULT;

-- Step 4: Update the columns that use this enum (cast via text)
ALTER TABLE "Quotation"
  ALTER COLUMN "status" TYPE "QuotationStatus"
  USING "status"::text::"QuotationStatus";

ALTER TABLE "StatusHistory"
  ALTER COLUMN "fromStatus" TYPE "QuotationStatus"
  USING "fromStatus"::text::"QuotationStatus";

ALTER TABLE "StatusHistory"
  ALTER COLUMN "toStatus" TYPE "QuotationStatus"
  USING "toStatus"::text::"QuotationStatus";

-- Step 5: Restore the default
ALTER TABLE "Quotation" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"QuotationStatus";

-- Step 6: Drop the old enum
DROP TYPE "QuotationStatus_old";
