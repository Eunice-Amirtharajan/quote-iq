-- Fix StatusHistory → Quotation FK from RESTRICT to CASCADE so that
-- deleting a quotation also removes its status history entries.
ALTER TABLE "StatusHistory" DROP CONSTRAINT IF EXISTS "StatusHistory_quotationId_fkey";

ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_quotationId_fkey"
  FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
