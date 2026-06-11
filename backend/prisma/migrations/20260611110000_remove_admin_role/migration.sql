-- Remove ADMIN from Role enum
-- PostgreSQL does not support ALTER TYPE ... DROP VALUE, so we recreate the type.

-- Step 1: Rename the existing enum
ALTER TYPE "Role" RENAME TO "Role_old";

-- Step 2: Create the new enum without ADMIN
CREATE TYPE "Role" AS ENUM ('SALES_MANAGER', 'SALES_REP');

-- Step 3: Drop default before altering column type
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

-- Step 4: Update the column that uses this enum (cast via text)
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role"
  USING "role"::text::"Role";

-- Step 5: Restore the default
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'SALES_REP'::"Role";

-- Step 6: Drop the old enum
DROP TYPE "Role_old";
